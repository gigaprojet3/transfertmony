import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/errors";
import { parseWebhookEvent, verifyWebhookSignature } from "@/services/saspayService";
import { handleCollectionResult, handlePayoutResult, triggerPayout } from "@/services/transferService";

/**
 * POST /api/webhooks/saspay
 *
 * 1. Signature vérifiée sur le corps brut -> 401 sinon.
 * 2. Déduplication par eventId (table WebhookEvent) -> un webhook rejoué n'a aucun effet.
 * 3. Encaissement SUCCESS -> statut COLLECTED, puis décaissement lancé APRÈS la réponse (after()),
 *    pour répondre vite à SasPay. Si ce lancement échoue, la réconciliation le reprendra.
 * 4. En cas d'erreur interne -> 500 : SasPay renverra le webhook, et le retraitement est sans danger
 *    car toutes les transitions sont idempotentes.
 */
export async function POST(request) {
  const rawBody = await request.text();

  let signatureOk = false;
  try {
    signatureOk = verifyWebhookSignature(rawBody, request.headers);
  } catch (err) {
    console.error("[Webhook SasPay] Vérification impossible :", err.message);
  }
  if (!signatureOk) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const event = parseWebhookEvent(payload, rawBody);
  if (!event.reference) {
    return NextResponse.json({ error: "Référence manquante" }, { status: 400 });
  }

  // --- Déduplication ---
  let record;
  try {
    record = await prisma.webhookEvent.create({
      data: { provider: "saspay", eventId: event.eventId, type: event.type, reference: event.reference, payload },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    record = await prisma.webhookEvent.findUnique({ where: { eventId: event.eventId } });
    if (record?.processedAt) return NextResponse.json({ received: true, duplicate: true });
    // Déjà reçu mais pas traité (erreur précédente) : on retraite.
  }

  try {
    if (event.type === "COLLECTION") {
      const { payoutReady, transactionId } = await handleCollectionResult(event.reference, event);
      if (payoutReady) {
        after(async () => {
          try {
            await triggerPayout(transactionId);
          } catch (err) {
            console.error(`[Webhook SasPay] Décaissement non lancé pour ${event.reference}, la réconciliation reprendra :`, err);
          }
        });
      }
    } else {
      await handlePayoutResult(event.reference, event);
    }

    await prisma.webhookEvent.update({ where: { id: record.id }, data: { processedAt: new Date(), error: null } });
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[Webhook SasPay] Échec du traitement ${event.eventId} :`, err);
    await prisma.webhookEvent
      .update({ where: { id: record.id }, data: { error: String(err?.message ?? err).slice(0, 500) } })
      .catch(() => {});
    // Référence inconnue : inutile que SasPay réessaie indéfiniment.
    if (err?.code === "TRANSACTION_NOT_FOUND") return NextResponse.json({ error: "Transaction inconnue" }, { status: 404 });
    return NextResponse.json({ error: "Traitement impossible" }, { status: 500 });
  }
}

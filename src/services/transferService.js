import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { computeQuote, getCorridor } from "@/lib/pricing";
import { assertMomoAccount } from "@/lib/validation";
import { STATUS_META } from "@/lib/status";
import { collectMoney, sendMoney, getTransactionStatus, SasPayError } from "@/services/saspayService";

/**
 * Orchestration d'un transfert : Encaissement (pay-in) -> webhook -> Décaissement (pay-out).
 *
 * Garanties :
 *  1. Idempotence client : (senderId, idempotencyKey) est unique en base -> un double clic
 *     ou un retry réseau renvoie la MÊME transaction, sans second débit.
 *  2. Idempotence fournisseur : chaque appel SasPay porte la clé `${reference}:collect|payout`.
 *  3. Transitions atomiques (compare-and-swap sur le statut) : un webhook reçu deux fois,
 *     ou en concurrence avec la réconciliation, ne déclenche qu'UN SEUL décaissement.
 *  4. Un résultat incertain (timeout) n'est jamais traité comme un échec.
 */

const D = Prisma.Decimal;
const ACTIVE = ["PENDING", "COLLECTING", "COLLECTED", "PAYOUT_PROCESSING"];

function newReference() {
  return `TM-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function hashRequest(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

/**
 * Transition atomique : ne s'applique que si le statut courant est dans `from`.
 * Retourne true si CETTE exécution a effectué la transition (et donc « possède » l'étape suivante).
 */
async function transition(id, from, to, data = {}, note = null) {
  return prisma.$transaction(async (db) => {
    const { count } = await db.transaction.updateMany({
      where: { id, status: { in: from } },
      data: { ...data, status: to },
    });
    if (count === 1) {
      await db.transactionEvent.create({ data: { transactionId: id, status: to, note } });
    }
    return count === 1;
  });
}

async function addNote(id, status, note) {
  await prisma.transactionEvent.create({ data: { transactionId: id, status, note } });
}

const isDefinitiveRejection = (err) => err instanceof SasPayError && (err.kind === "REJECTED" || err.kind === "CONFIG");

/* -------------------------------------------------------------------------- */
/*  1. Initiation                                                              */
/* -------------------------------------------------------------------------- */

export async function initiateTransfer({ user, input, idempotencyKey }) {
  // --- Résolution du destinataire ---
  let recipientUser = null;
  let toCountry, recipientPhone, recipientOperator, recipientName;

  if (input.recipientHandle) {
    recipientUser = await prisma.user.findUnique({ where: { receiveHandle: input.recipientHandle } });
    if (!recipientUser) throw new AppError("RECIPIENT_NOT_FOUND", "Ce lien de réception n'existe pas.", 404);
    toCountry = recipientUser.countryCode;
    recipientPhone = recipientUser.momoNumber;
    recipientOperator = recipientUser.momoOperator;
    recipientName = `${recipientUser.firstName} ${recipientUser.lastName}`;
  } else {
    toCountry = input.toCountry;
    recipientPhone = input.recipientPhone;
    recipientOperator = input.recipientOperator;
    recipientUser = await prisma.user.findUnique({ where: { momoNumber: recipientPhone } });
    recipientName = input.recipientName ?? (recipientUser ? `${recipientUser.firstName} ${recipientUser.lastName}` : null);
  }

  const senderPhone = input.senderPhone ?? user.momoNumber;
  const senderOperator = input.senderOperator;
  if (senderPhone === recipientPhone) {
    throw new AppError("SAME_ACCOUNT", "Le numéro du destinataire est identique au numéro débité.", 422);
  }

  // --- Contrôles corridor + devis recalculé côté serveur ---
  const { from, to } = await getCorridor(input.fromCountry, toCountry);
  assertMomoAccount(from, senderPhone, senderOperator, "à débiter");
  assertMomoAccount(to, recipientPhone, recipientOperator, "du destinataire");
  const quote = computeQuote({ from, to, amount: input.amount });

  const requestHash = hashRequest({
    fromCountry: from.countryCode,
    toCountry: to.countryCode,
    amount: quote.sendAmount.toString(),
    senderPhone,
    senderOperator,
    recipientPhone,
    recipientOperator,
  });

  // --- Idempotence : la même clé renvoie la même transaction ---
  const existing = await prisma.transaction.findUnique({
    where: { senderId_idempotencyKey: { senderId: user.id, idempotencyKey } },
  });
  if (existing) return replay(existing, requestHash);

  let tx;
  try {
    tx = await prisma.transaction.create({
      data: {
        reference: newReference(),
        idempotencyKey,
        requestHash,
        senderId: user.id,
        recipientId: recipientUser?.id ?? null,
        fromCountry: from.countryCode,
        toCountry: to.countryCode,
        senderPhone,
        senderOperator,
        recipientPhone,
        recipientOperator,
        recipientName,
        sendAmount: quote.sendAmount,
        sendCurrency: quote.sendCurrency,
        fee: quote.fee,
        totalDebit: quote.totalDebit,
        exchangeRate: quote.exchangeRate,
        receiveAmount: quote.receiveAmount,
        receiveCurrency: quote.receiveCurrency,
        status: "PENDING",
        events: { create: { status: "PENDING", note: "Transfert créé" } },
      },
    });
  } catch (err) {
    // Deux requêtes simultanées avec la même clé : la seconde récupère la première.
    if (isUniqueViolation(err)) {
      const raced = await prisma.transaction.findUnique({
        where: { senderId_idempotencyKey: { senderId: user.id, idempotencyKey } },
      });
      if (raced) return replay(raced, requestHash);
    }
    throw err;
  }

  await startCollection(tx);
  return { transaction: await prisma.transaction.findUnique({ where: { id: tx.id } }), replayed: false };
}

function replay(existing, requestHash) {
  if (existing.requestHash !== requestHash) {
    throw new AppError(
      "IDEMPOTENCY_CONFLICT",
      "Cette clé d'idempotence a déjà été utilisée pour un autre transfert.",
      409
    );
  }
  return { transaction: existing, replayed: true };
}

/* -------------------------------------------------------------------------- */
/*  2. Encaissement                                                            */
/* -------------------------------------------------------------------------- */

async function startCollection(tx) {
  // On passe à COLLECTING AVANT l'appel : si le processus tombe pendant l'appel,
  // la réconciliation saura qu'une demande a pu partir.
  const won = await transition(tx.id, ["PENDING"], "COLLECTING", {}, "Demande d'encaissement envoyée à SasPay");
  if (!won) return;

  try {
    const result = await collectMoney({
      reference: tx.reference,
      amount: tx.totalDebit,
      currency: tx.sendCurrency,
      phone: tx.senderPhone,
      operator: tx.senderOperator,
      country: tx.fromCountry,
    });
    if (result.providerRef) {
      await prisma.transaction.update({ where: { id: tx.id }, data: { collectProviderRef: result.providerRef } });
    }
    // Certains opérateurs répondent de façon synchrone.
    if (result.status !== "PENDING") {
      const { payoutReady } = await handleCollectionResult(tx.reference, result);
      if (payoutReady) await triggerPayout(tx.id);
    }
  } catch (err) {
    if (isDefinitiveRejection(err)) {
      await transition(tx.id, ["COLLECTING"], "FAILED", { failureReason: err.message, failedAt: new Date() }, "Encaissement refusé");
      return;
    }
    // Résultat incertain : on reste en COLLECTING. Webhook ou réconciliation trancheront.
    console.error(`[TransfertMony] Encaissement incertain ${tx.reference} :`, err.message);
    await addNote(tx.id, "COLLECTING", `Réponse SasPay incertaine : ${err.message}`);
  }
}

/**
 * Applique un résultat d'encaissement (webhook ou réconciliation).
 * Retourne { payoutReady } : true si les fonds sont encaissés et le décaissement peut partir.
 */
export async function handleCollectionResult(reference, result) {
  const tx = await prisma.transaction.findUnique({ where: { reference } });
  if (!tx) throw new AppError("TRANSACTION_NOT_FOUND", `Transaction inconnue : ${reference}`, 404);

  if (result.status === "PENDING") return { payoutReady: false };

  if (result.status === "FAILED") {
    await transition(
      tx.id,
      ["PENDING", "COLLECTING"],
      "FAILED",
      { failureReason: result.failureReason ?? "Paiement refusé ou annulé", failedAt: new Date() },
      "Encaissement échoué (SasPay)"
    );
    return { payoutReady: false };
  }

  // SUCCESS : on vérifie que le montant réellement encaissé est celui attendu.
  const amountMismatch = result.amount != null && !new D(result.amount).eq(tx.totalDebit);
  const currencyMismatch = result.currency != null && result.currency !== tx.sendCurrency;
  if (amountMismatch || currencyMismatch) {
    console.error(`[ALERTE] Montant encaissé incohérent pour ${reference}`, result);
    await transition(
      tx.id,
      ["PENDING", "COLLECTING", "FAILED"],
      "ON_HOLD",
      { failureReason: `Encaissé ${result.amount} ${result.currency}, attendu ${tx.totalDebit} ${tx.sendCurrency}` },
      "Montant incohérent : vérification manuelle"
    );
    return { payoutReady: false };
  }

  // FAILED est inclus : si SasPay confirme finalement un encaissement que l'on croyait échoué,
  // l'argent a bien été pris -> il DOIT être envoyé au destinataire.
  await transition(
    tx.id,
    ["PENDING", "COLLECTING", "FAILED"],
    "COLLECTED",
    {
      collectedAt: new Date(),
      failureReason: null,
      failedAt: null,
      ...(result.providerRef ? { collectProviderRef: result.providerRef } : {}),
    },
    "Encaissement confirmé"
  );

  const current = await prisma.transaction.findUnique({ where: { id: tx.id }, select: { status: true } });
  return { payoutReady: current?.status === "COLLECTED", transactionId: tx.id };
}

/* -------------------------------------------------------------------------- */
/*  3. Décaissement                                                            */
/* -------------------------------------------------------------------------- */

export async function triggerPayout(transactionId) {
  // Seule l'exécution qui gagne cette transition envoie l'argent : pas de double décaissement.
  const won = await transition(
    transactionId,
    ["COLLECTED"],
    "PAYOUT_PROCESSING",
    { payoutAttempts: { increment: 1 } },
    "Décaissement demandé à SasPay"
  );
  if (!won) return;

  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
  try {
    const result = await sendMoney({
      reference: tx.reference,
      amount: tx.receiveAmount,
      currency: tx.receiveCurrency,
      phone: tx.recipientPhone,
      operator: tx.recipientOperator,
      country: tx.toCountry,
      recipientName: tx.recipientName ?? undefined,
    });
    if (result.providerRef) {
      await prisma.transaction.update({ where: { id: tx.id }, data: { payoutProviderRef: result.providerRef } });
    }
    if (result.status !== "PENDING") await handlePayoutResult(tx.reference, result);
  } catch (err) {
    if (isDefinitiveRejection(err)) {
      await failPayout(tx, err.message);
      return;
    }
    console.error(`[TransfertMony] Décaissement incertain ${tx.reference} :`, err.message);
    await addNote(tx.id, "PAYOUT_PROCESSING", `Réponse SasPay incertaine : ${err.message}`);
  }
}

async function failPayout(tx, reason) {
  const won = await transition(
    tx.id,
    ["PAYOUT_PROCESSING"],
    "PAYOUT_FAILED",
    { failureReason: reason, failedAt: new Date() },
    "Décaissement échoué : remboursement requis"
  );
  if (won) {
    // L'expéditeur a été débité : ce cas DOIT déclencher un remboursement (manuel ou automatisé).
    console.error(`[ALERTE REMBOURSEMENT] ${tx.reference} : ${tx.totalDebit} ${tx.sendCurrency} à rembourser au ${tx.senderPhone}`);
  }
}

export async function handlePayoutResult(reference, result) {
  const tx = await prisma.transaction.findUnique({ where: { reference } });
  if (!tx) throw new AppError("TRANSACTION_NOT_FOUND", `Transaction inconnue : ${reference}`, 404);

  if (result.status === "SUCCESS") {
    // PAYOUT_FAILED inclus : si l'envoi a finalement réussi, il ne faut surtout pas rembourser.
    await transition(
      tx.id,
      ["PAYOUT_PROCESSING", "PAYOUT_FAILED"],
      "COMPLETED",
      {
        completedAt: new Date(),
        failureReason: null,
        failedAt: null,
        ...(result.providerRef ? { payoutProviderRef: result.providerRef } : {}),
      },
      "Fonds reçus par le destinataire"
    );
  } else if (result.status === "FAILED") {
    await failPayout(tx, result.failureReason ?? "Décaissement refusé par l'opérateur");
  }
}

/* -------------------------------------------------------------------------- */
/*  4. Réconciliation (filet de sécurité si un webhook se perd)                 */
/* -------------------------------------------------------------------------- */

export async function reconcileStaleTransactions({ olderThanMinutes = 10, limit = 50 } = {}) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const stale = await prisma.transaction.findMany({
    where: {
      status: { in: ACTIVE },
      updatedAt: { lt: cutoff },
      OR: [{ reconciledAt: null }, { reconciledAt: { lt: cutoff } }],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  const report = [];
  for (const tx of stale) {
    try {
      await prisma.transaction.update({ where: { id: tx.id }, data: { reconciledAt: new Date() } });
      if (tx.status === "COLLECTED") {
        await triggerPayout(tx.id);
      } else if (tx.status === "PAYOUT_PROCESSING") {
        await handlePayoutResult(tx.reference, await getTransactionStatus("payout", tx.reference));
      } else {
        const { payoutReady } = await handleCollectionResult(tx.reference, await getTransactionStatus("collect", tx.reference));
        if (payoutReady) await triggerPayout(tx.id);
      }
      report.push({ reference: tx.reference, ok: true });
    } catch (err) {
      // Demande d'encaissement jamais reçue par SasPay (404) : aucun débit possible -> échec sûr.
      if (tx.status !== "PAYOUT_PROCESSING" && err instanceof SasPayError && err.httpStatus === 404) {
        await transition(tx.id, ["PENDING", "COLLECTING"], "FAILED", { failureReason: "Encaissement non initié", failedAt: new Date() }, "Réconciliation");
      }
      report.push({ reference: tx.reference, ok: false, error: err.message });
    }
  }
  return report;
}

/* -------------------------------------------------------------------------- */
/*  DTO                                                                        */
/* -------------------------------------------------------------------------- */

const maskPhone = (p) => (p ? `+${p.slice(0, -6)}••${p.slice(-4)}` : null);

export function toPublicTransaction(tx, viewerId) {
  const direction = tx.senderId === viewerId ? "SENT" : "RECEIVED";
  const meta = STATUS_META[tx.status];
  return {
    id: tx.id,
    reference: tx.reference,
    direction,
    status: tx.status,
    statusLabel: meta.label,
    statusTone: meta.tone,
    statusHint: meta.hint,
    fromCountry: tx.fromCountry,
    toCountry: tx.toCountry,
    sendAmount: tx.sendAmount.toString(),
    sendCurrency: tx.sendCurrency,
    fee: direction === "SENT" ? tx.fee.toString() : null,
    totalDebit: direction === "SENT" ? tx.totalDebit.toString() : null,
    exchangeRate: tx.exchangeRate.toString(),
    receiveAmount: tx.receiveAmount.toString(),
    receiveCurrency: tx.receiveCurrency,
    counterparty:
      direction === "SENT"
        ? { name: tx.recipientName, phone: maskPhone(tx.recipientPhone), operator: tx.recipientOperator }
        : {
            name: tx.sender ? `${tx.sender.firstName} ${tx.sender.lastName}` : null,
            phone: maskPhone(tx.senderPhone),
            operator: tx.senderOperator,
          },
    failureReason: direction === "SENT" ? tx.failureReason : null,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

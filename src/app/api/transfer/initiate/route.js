import { NextResponse } from "next/server";
import { requireUser, verifyUserPin } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";
import { initiateTransferSchema, parseOrThrow, readJson } from "@/lib/validation";
import { initiateTransfer, toPublicTransaction } from "@/services/transferService";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9-]{16,64}$/;

/**
 * POST /api/transfer/initiate
 * En-tête obligatoire : Idempotency-Key (UUID généré par le client à chaque nouveau transfert,
 * réutilisé tel quel en cas de nouvelle tentative).
 */
export async function POST(request) {
  try {
    const user = await requireUser(request);

    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "En-tête Idempotency-Key manquant ou invalide.", 400);
    }

    const input = parseOrThrow(initiateTransferSchema, await readJson(request));

    // Le PIN est vérifié AVANT toute opération financière (et même pour une relance idempotente).
    await verifyUserPin(user.id, input.pin);

    const { transaction, replayed } = await initiateTransfer({ user, input, idempotencyKey });

    return NextResponse.json(
      { transaction: toPublicTransaction(transaction, user.id), replayed },
      { status: replayed ? 200 : 201 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

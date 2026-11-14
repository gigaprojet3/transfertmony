import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { toPublicTransaction } from "@/services/transferService";

/** GET /api/transactions?type=all|sent|received&limit=30 : historique de l'utilisateur. */
export async function GET(request) {
  try {
    const user = await requireUser(request);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "all";
    const limit = Math.min(Number(searchParams.get("limit")) || 30, 100);

    const sent = { senderId: user.id };
    // Côté destinataire, on n'affiche pas les tentatives où l'expéditeur n'a jamais payé.
    const received = { recipientId: user.id, status: { notIn: ["PENDING", "FAILED"] } };
    const where = type === "sent" ? sent : type === "received" ? received : { OR: [sent, received] };

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { sender: { select: { firstName: true, lastName: true } } },
    });

    return NextResponse.json({ transactions: transactions.map((t) => toPublicTransaction(t, user.id)) });
  } catch (err) {
    return errorResponse(err);
  }
}

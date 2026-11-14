import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { AppError, errorResponse } from "@/lib/errors";

/** GET /api/users/lookup?handle=xxx : infos minimales d'un destinataire (lien de réception). */
export async function GET(request) {
  try {
    await requireUser(request);
    const handle = new URL(request.url).searchParams.get("handle")?.toLowerCase();
    if (!handle) throw new AppError("VALIDATION_ERROR", "Paramètre handle requis.", 422);

    const u = await prisma.user.findUnique({ where: { receiveHandle: handle } });
    if (!u) throw new AppError("RECIPIENT_NOT_FOUND", "Ce lien de réception n'existe pas.", 404);

    return NextResponse.json({
      recipient: {
        handle: u.receiveHandle,
        name: `${u.firstName} ${u.lastName.charAt(0)}.`,
        countryCode: u.countryCode,
        operator: u.momoOperator,
        phone: `+${u.momoNumber.slice(0, -6)}••${u.momoNumber.slice(-4)}`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

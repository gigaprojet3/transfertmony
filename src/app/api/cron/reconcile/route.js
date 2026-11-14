import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { reconcileStaleTransactions } from "@/services/transferService";

/**
 * GET /api/cron/reconcile — à appeler toutes les 5 min par un cron (Vercel Cron, crontab…).
 * En-tête : Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  const given = request.headers.get("authorization") ?? "";
  const ok =
    process.env.CRON_SECRET &&
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const report = await reconcileStaleTransactions();
    return NextResponse.json({ checked: report.length, report });
  } catch (err) {
    return errorResponse(err);
  }
}

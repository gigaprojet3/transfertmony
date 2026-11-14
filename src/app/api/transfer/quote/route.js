import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/errors";
import { computeQuote, getCorridor, serializeQuote } from "@/lib/pricing";
import { AppError } from "@/lib/errors";

/** GET /api/transfer/quote?from=CG&to=CI&amount=10000 : simulateur (frais + taux). */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fromCountry = searchParams.get("from")?.toUpperCase();
    const toCountry = searchParams.get("to")?.toUpperCase();
    const amount = searchParams.get("amount");
    if (!fromCountry || !toCountry || !amount) {
      throw new AppError("VALIDATION_ERROR", "Paramètres from, to et amount requis.", 422);
    }
    const { from, to } = await getCorridor(fromCountry, toCountry);
    return NextResponse.json({ quote: serializeQuote(computeQuote({ from, to, amount })) });
  } catch (err) {
    return errorResponse(err);
  }
}

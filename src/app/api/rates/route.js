import { NextResponse, connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/errors";

/** GET /api/rates : pays, devises, opérateurs et frais disponibles. */
export async function GET() {
  try {
    await connection(); // rendu dynamique : jamais figé au build
    const countries = await prisma.countryRate.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      countries: countries.map((c) => ({
        countryCode: c.countryCode,
        name: c.name,
        dialCode: c.dialCode,
        currency: c.currency,
        currencyDecimals: c.currencyDecimals,
        operators: c.operators,
        canSend: c.canSend,
        canReceive: c.canReceive,
        feePercent: c.feePercent.toString(),
        feeFixed: c.feeFixed.toString(),
        minAmount: c.minAmount.toString(),
        maxAmount: c.maxAmount.toString(),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

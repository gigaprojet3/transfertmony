import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

/**
 * Calcul des frais et de la conversion.
 * RÈGLE : aucun nombre flottant JavaScript pour l'argent — uniquement Decimal.
 * Le devis est TOUJOURS recalculé côté serveur ; les montants envoyés par le client sont ignorés.
 */
const D = Prisma.Decimal;

// Marge de change appliquée uniquement quand les devises diffèrent (ex. XAF -> KES).
const FX_MARGIN_PERCENT = new D(process.env.FX_MARGIN_PERCENT ?? "1");

export async function getCorridor(fromCountry, toCountry) {
  const [from, to] = await Promise.all([
    prisma.countryRate.findUnique({ where: { countryCode: fromCountry } }),
    prisma.countryRate.findUnique({ where: { countryCode: toCountry } }),
  ]);
  if (!from || !from.isActive || !from.canSend) {
    throw new AppError("COUNTRY_NOT_SUPPORTED", "L'envoi depuis ce pays n'est pas encore disponible.", 422);
  }
  if (!to || !to.isActive || !to.canReceive) {
    throw new AppError("COUNTRY_NOT_SUPPORTED", "La réception dans ce pays n'est pas encore disponible.", 422);
  }
  return { from, to };
}

export function computeQuote({ from, to, amount }) {
  let sendAmount;
  try {
    sendAmount = new D(amount);
  } catch {
    throw new AppError("INVALID_AMOUNT", "Montant invalide.", 422);
  }
  if (!sendAmount.isFinite() || sendAmount.lte(0)) {
    throw new AppError("INVALID_AMOUNT", "Le montant doit être supérieur à zéro.", 422);
  }
  if (sendAmount.decimalPlaces() > from.currencyDecimals) {
    throw new AppError("INVALID_AMOUNT", `Le ${from.currency} n'accepte pas plus de ${from.currencyDecimals} décimale(s).`, 422);
  }
  if (sendAmount.lt(from.minAmount)) {
    throw new AppError("AMOUNT_TOO_LOW", `Montant minimum : ${from.minAmount} ${from.currency}.`, 422);
  }
  if (sendAmount.gt(from.maxAmount)) {
    throw new AppError("AMOUNT_TOO_HIGH", `Montant maximum par transfert : ${from.maxAmount} ${from.currency}.`, 422);
  }

  // Frais arrondis au supérieur, montant reçu arrondi à l'inférieur : on ne paie jamais plus que ce qui a été encaissé.
  const fee = sendAmount
    .mul(from.feePercent)
    .div(100)
    .plus(from.feeFixed)
    .toDecimalPlaces(from.currencyDecimals, D.ROUND_UP);
  const totalDebit = sendAmount.plus(fee);

  let exchangeRate = new D(1);
  if (from.currency !== to.currency) {
    exchangeRate = new D(to.unitsPerUsd)
      .div(from.unitsPerUsd)
      .mul(new D(1).minus(FX_MARGIN_PERCENT.div(100)))
      .toDecimalPlaces(8, D.ROUND_DOWN);
  }
  const receiveAmount = sendAmount.mul(exchangeRate).toDecimalPlaces(to.currencyDecimals, D.ROUND_DOWN);
  if (receiveAmount.lte(0)) {
    throw new AppError("AMOUNT_TOO_LOW", "Montant trop faible après conversion.", 422);
  }

  return {
    fromCountry: from.countryCode,
    toCountry: to.countryCode,
    sendAmount,
    sendCurrency: from.currency,
    fee,
    totalDebit,
    exchangeRate,
    receiveAmount,
    receiveCurrency: to.currency,
  };
}

/** Version sérialisable (chaînes) pour les réponses JSON. */
export function serializeQuote(q) {
  return {
    ...q,
    sendAmount: q.sendAmount.toString(),
    fee: q.fee.toString(),
    totalDebit: q.totalDebit.toString(),
    exchangeRate: q.exchangeRate.toString(),
    receiveAmount: q.receiveAmount.toString(),
  };
}

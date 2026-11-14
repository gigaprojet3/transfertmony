// Données initiales des corridors. Taux INDICATIFS : à mettre à jour avec votre source de change.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const countries = [
  { countryCode: "CG", name: "Congo-Brazzaville", dialCode: "242", currency: "XAF", currencyDecimals: 0, unitsPerUsd: "600", operators: ["MTN", "AIRTEL"], minAmount: "500", maxAmount: "2000000" },
  { countryCode: "CD", name: "RD Congo", dialCode: "243", currency: "CDF", currencyDecimals: 2, unitsPerUsd: "2850", operators: ["MPESA", "AIRTEL", "ORANGE"], minAmount: "2000", maxAmount: "8000000" },
  { countryCode: "CM", name: "Cameroun", dialCode: "237", currency: "XAF", currencyDecimals: 0, unitsPerUsd: "600", operators: ["MTN", "ORANGE"], minAmount: "500", maxAmount: "2000000" },
  { countryCode: "GA", name: "Gabon", dialCode: "241", currency: "XAF", currencyDecimals: 0, unitsPerUsd: "600", operators: ["AIRTEL", "MOOV"], minAmount: "500", maxAmount: "2000000" },
  { countryCode: "CI", name: "Côte d'Ivoire", dialCode: "225", currency: "XOF", currencyDecimals: 0, unitsPerUsd: "600", operators: ["ORANGE", "MTN", "MOOV", "WAVE"], minAmount: "500", maxAmount: "2000000" },
  { countryCode: "SN", name: "Sénégal", dialCode: "221", currency: "XOF", currencyDecimals: 0, unitsPerUsd: "600", operators: ["ORANGE", "WAVE", "FREE"], minAmount: "500", maxAmount: "2000000" },
  { countryCode: "BJ", name: "Bénin", dialCode: "229", currency: "XOF", currencyDecimals: 0, unitsPerUsd: "600", operators: ["MTN", "MOOV"], minAmount: "500", maxAmount: "2000000" },
  { countryCode: "GH", name: "Ghana", dialCode: "233", currency: "GHS", currencyDecimals: 2, unitsPerUsd: "15.5", operators: ["MTN", "TELECEL", "AIRTEL"], minAmount: "10", maxAmount: "50000" },
  { countryCode: "KE", name: "Kenya", dialCode: "254", currency: "KES", currencyDecimals: 2, unitsPerUsd: "129", operators: ["MPESA", "AIRTEL"], minAmount: "100", maxAmount: "300000" },
  { countryCode: "UG", name: "Ouganda", dialCode: "256", currency: "UGX", currencyDecimals: 0, unitsPerUsd: "3700", operators: ["MTN", "AIRTEL"], minAmount: "3000", maxAmount: "10000000" },
  { countryCode: "RW", name: "Rwanda", dialCode: "250", currency: "RWF", currencyDecimals: 0, unitsPerUsd: "1400", operators: ["MTN", "AIRTEL"], minAmount: "1000", maxAmount: "3000000" },
];

async function main() {
  for (const c of countries) {
    const data = { ...c, feePercent: "1.5", feeFixed: "0" };
    await prisma.countryRate.upsert({ where: { countryCode: c.countryCode }, create: data, update: data });
  }
  console.log(`${countries.length} pays initialisés.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

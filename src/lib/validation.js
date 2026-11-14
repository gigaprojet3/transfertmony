import { z } from "zod";
import { AppError } from "@/lib/errors";

// Numéros au format international sans « + » : indicatif pays + numéro (ex. 242061234567).
const phone = z
  .string()
  .transform((v) => v.replace(/[\s.\-()+]/g, ""))
  .pipe(z.string().regex(/^\d{8,15}$/, "Numéro de téléphone invalide"));

const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Code pays invalide");
const operator = z.string().trim().toUpperCase().min(2).max(20);
const pin = z
  .string()
  .regex(/^\d{4}$/, "Le code PIN doit contenir 4 chiffres")
  .refine((v) => !["0000", "1111", "1234", "4321", "9999"].includes(v), "Code PIN trop simple");

export const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email("Email invalide"),
  phone,
  password: z.string().min(8, "8 caractères minimum").max(128),
  pin,
  countryCode,
  momoNumber: phone.optional(),
  momoOperator: operator,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(120), // email ou téléphone
  password: z.string().min(1).max(128),
});

export const initiateTransferSchema = z
  .object({
    fromCountry: countryCode,
    toCountry: countryCode.optional(),
    amount: z.union([z.string(), z.number()]).transform(String),
    senderPhone: phone.optional(),
    senderOperator: operator,
    // Soit un identifiant de réception TransfertMony, soit un numéro Mobile Money explicite.
    recipientHandle: z.string().trim().toLowerCase().max(40).optional(),
    recipientPhone: phone.optional(),
    recipientOperator: operator.optional(),
    recipientName: z.string().trim().min(2).max(80).optional(),
    pin: z.string().regex(/^\d{4}$/, "Code PIN invalide"),
  })
  .refine((v) => v.recipientHandle || (v.recipientPhone && v.recipientOperator && v.toCountry), {
    message: "Indiquez le numéro, l'opérateur et le pays du destinataire",
  });

export function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError("VALIDATION_ERROR", issue?.message ?? "Données invalides", 422, {
      field: issue?.path?.join("."),
    });
  }
  return result.data;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new AppError("INVALID_JSON", "Corps de requête JSON invalide.", 400);
  }
}

/** Vérifie qu'un numéro commence par l'indicatif du pays et que l'opérateur y est disponible. */
export function assertMomoAccount(country, number, op, label) {
  if (!number.startsWith(country.dialCode)) {
    throw new AppError("INVALID_PHONE", `Le numéro ${label} doit commencer par l'indicatif +${country.dialCode} (${country.name}).`, 422);
  }
  if (!country.operators.includes(op)) {
    throw new AppError("OPERATOR_NOT_SUPPORTED", `L'opérateur ${op} n'est pas disponible au ${country.name}.`, 422);
  }
}

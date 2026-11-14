import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashSecret, publicUser } from "@/lib/auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { AppError, errorResponse, isUniqueViolation } from "@/lib/errors";
import { assertMomoAccount, parseOrThrow, readJson, registerSchema } from "@/lib/validation";

function makeHandle(firstName) {
  const base = firstName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16) || "user";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

export async function POST(request) {
  try {
    const input = parseOrThrow(registerSchema, await readJson(request));
    const momoNumber = input.momoNumber ?? input.phone;

    const country = await prisma.countryRate.findUnique({ where: { countryCode: input.countryCode } });
    if (!country?.isActive) throw new AppError("COUNTRY_NOT_SUPPORTED", "Pays non pris en charge.", 422);
    assertMomoAccount(country, momoNumber, input.momoOperator, "Mobile Money");

    const [passwordHash, pinHash] = await Promise.all([hashSecret(input.password), hashSecret(input.pin)]);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          passwordHash,
          pinHash,
          countryCode: country.countryCode,
          momoNumber,
          momoOperator: input.momoOperator,
          receiveHandle: makeHandle(input.firstName),
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError("ACCOUNT_EXISTS", "Un compte existe déjà avec cet email ou ce numéro.", 409);
      }
      throw err;
    }

    const response = NextResponse.json({ user: publicUser(user) }, { status: 201 });
    setSessionCookie(response, await createSessionToken(user.id));
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}

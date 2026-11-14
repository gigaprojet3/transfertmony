import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compareSecret, hashSecret, publicUser } from "@/lib/auth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { AppError, errorResponse } from "@/lib/errors";
import { loginSchema, parseOrThrow, readJson } from "@/lib/validation";

// Hash factice : la comparaison prend le même temps que le compte existe ou non.
let dummyHashPromise;
const getDummyHash = () => (dummyHashPromise ??= hashSecret("transfertmony-dummy-password"));

export async function POST(request) {
  try {
    const { identifier, password } = parseOrThrow(loginSchema, await readJson(request));
    const asPhone = identifier.replace(/[\s.\-()+]/g, "");

    const user = await prisma.user.findFirst({
      where: identifier.includes("@") ? { email: identifier.toLowerCase() } : { phone: asPhone },
    });
    const ok = await compareSecret(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !ok) {
      throw new AppError("INVALID_CREDENTIALS", "Identifiant ou mot de passe incorrect.", 401);
    }

    const response = NextResponse.json({ user: publicUser(user) });
    setSessionCookie(response, await createSessionToken(user.id));
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}

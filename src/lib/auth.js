import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const BCRYPT_COST = 12;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

export const hashSecret = (value) => bcrypt.hash(value, BCRYPT_COST);
export const compareSecret = (value, hash) => bcrypt.compare(value, hash);

/**
 * Protection CSRF complémentaire au cookie SameSite=Lax :
 * une requête qui modifie des données doit venir de notre propre origine.
 */
function assertSameOrigin(request) {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin) return; // clients non navigateur (ex. tests) : le cookie SameSite protège déjà
  const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
  if (origin !== expected) throw new AppError("FORBIDDEN_ORIGIN", "Origine de la requête non autorisée.", 403);
}

/** Récupère l'utilisateur connecté ou lève une erreur 401. */
export async function requireUser(request) {
  assertSameOrigin(request);
  const userId = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) throw new AppError("UNAUTHORIZED", "Session expirée, reconnectez-vous.", 401);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("UNAUTHORIZED", "Session expirée, reconnectez-vous.", 401);
  return user;
}

/**
 * Vérifie le code PIN avec verrouillage après 5 échecs (15 min).
 * Le compteur est incrémenté de façon atomique pour résister aux requêtes parallèles.
 */
export async function verifyUserPin(userId, pin) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinHash: true, pinFailedAttempts: true, pinLockedUntil: true },
  });
  if (!user) throw new AppError("UNAUTHORIZED", "Session expirée, reconnectez-vous.", 401);

  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    throw new AppError("PIN_LOCKED", "Trop de codes PIN erronés. Réessayez dans quelques minutes.", 423, {
      lockedUntil: user.pinLockedUntil,
    });
  }

  const ok = await compareSecret(pin, user.pinHash);
  if (ok) {
    if (user.pinFailedAttempts > 0 || user.pinLockedUntil) {
      await prisma.user.update({ where: { id: userId }, data: { pinFailedAttempts: 0, pinLockedUntil: null } });
    }
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { pinFailedAttempts: { increment: 1 } },
    select: { pinFailedAttempts: true },
  });
  if (updated.pinFailedAttempts >= PIN_MAX_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: { pinFailedAttempts: 0, pinLockedUntil: new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) },
    });
    throw new AppError("PIN_LOCKED", `Code PIN bloqué pendant ${PIN_LOCK_MINUTES} minutes après ${PIN_MAX_ATTEMPTS} échecs.`, 423);
  }
  throw new AppError("INVALID_PIN", "Code PIN incorrect.", 401, {
    remainingAttempts: PIN_MAX_ATTEMPTS - updated.pinFailedAttempts,
  });
}

/** Données de profil exposables au client (jamais les hash). */
export function publicUser(user) {
  const appUrl = process.env.APP_URL ?? "";
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    countryCode: user.countryCode,
    momoNumber: user.momoNumber,
    momoOperator: user.momoOperator,
    receiveHandle: user.receiveHandle,
    receiveLink: `${appUrl}/dashboard?to=${user.receiveHandle}`,
  };
}

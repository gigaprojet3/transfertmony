import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";

/**
 * Erreur métier « attendue » : son message peut être montré à l'utilisateur.
 * Toute autre exception est traitée comme une erreur interne (message générique).
 */
export class AppError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorResponse(err) {
  // Erreurs internes de Next.js (rendu dynamique, redirect…) : à laisser remonter, ce ne sont pas des bugs.
  unstable_rethrow(err);
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status }
    );
  }
  // Base de données injoignable (serveur arrêté, mauvais DATABASE_URL…) : 503 plutôt que 500.
  if (err?.name === "PrismaClientInitializationError") {
    console.error("[TransfertMony] Base de données injoignable :", err.message);
    return NextResponse.json(
      { error: { code: "SERVICE_UNAVAILABLE", message: "Service momentanément indisponible. Réessayez dans quelques instants." } },
      { status: 503 }
    );
  }
  // Ne jamais renvoyer le détail d'une erreur interne au client.
  console.error("[TransfertMony] Erreur interne :", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Une erreur interne est survenue. Aucun montant n'a été débité sans confirmation." } },
    { status: 500 }
  );
}

/** Code Prisma levé lors d'une violation de contrainte d'unicité. */
export function isUniqueViolation(err) {
  return err?.code === "P2002";
}

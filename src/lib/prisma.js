import { PrismaClient } from "@prisma/client";

// Un seul client Prisma par processus (évite d'épuiser les connexions en dev avec le hot reload).
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

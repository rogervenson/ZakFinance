import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Veja .env.example.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: ["warn", "error"] });
}

function getClient() {
  const client = (globalForPrisma.prisma ??= createClient());
  return client;
}

/**
 * Database client, created on first use (not at import time), so `next build` works
 * without DATABASE_URL — the build never queries the database.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

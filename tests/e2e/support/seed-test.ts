// Dados fictícios para os testes e2e (rodado depois do seed base).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  // Os testes começam com a troca de senha obrigatória já cumprida, exceto o de auth,
  // que usa um usuário próprio criado aqui.
  await db.user.updateMany({ data: { mustChangePassword: false } });
}

main().finally(() => db.$disconnect());

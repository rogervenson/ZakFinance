// Dados fictícios para os testes e2e (rodado depois do seed base).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  // A troca de senha obrigatória já vem cumprida; o teste de auth a reativa.
  await db.user.updateMany({ data: { mustChangePassword: false } });

  const card = await db.account.findUniqueOrThrow({ where: { name: "Cartão Santander" } });
  const mercado = await db.category.findUniqueOrThrow({ where: { name_kind: { name: "Mercado", kind: "EXPENSE" } } });
  const invoice = await db.invoice.create({ data: { accountId: card.id, month: "2026-10", closingDate: d("2026-10-12"), dueDate: d("2026-10-20") } });
  // Histórico para a sugestão: "vitorino" → Mercado no cartão.
  await db.transaction.create({
    data: { type: "EXPENSE", date: d("2026-09-16"), month: "2026-10", description: "vitorino", amountCents: 53853, accountId: card.id, categoryId: mercado.id, invoiceId: invoice.id },
  });
}

main().finally(() => db.$disconnect());

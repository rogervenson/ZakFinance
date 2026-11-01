// Seed da configuração base — seguro para rodar várias vezes.
//
// Cria o que faltar (contas, categorias, projetos e o usuário, se não houver nenhum).
// Nunca apaga nem altera lançamentos ou cadastros existentes.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEFAULT_ACCOUNTS, DEFAULT_PROJECTS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../src/domain/defaults";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const OPENING_DATE = new Date("2026-01-01T00:00:00.000Z");

async function main() {
  for (const a of DEFAULT_ACCOUNTS) {
    await db.account.upsert({
      where: { name: a.name },
      update: {},
      create: { ...a, openingDate: OPENING_DATE },
    });
  }
  for (const [i, c] of EXPENSE_CATEGORIES.entries()) {
    await db.category.upsert({
      where: { name_kind: { name: c.name, kind: "EXPENSE" } },
      update: {},
      create: { name: c.name, kind: "EXPENSE", countsInCostOfLiving: c.countsInCostOfLiving, sortOrder: i },
    });
  }
  for (const [i, c] of INCOME_CATEGORIES.entries()) {
    await db.category.upsert({
      where: { name_kind: { name: c.name, kind: "INCOME" } },
      update: {},
      create: { name: c.name, kind: "INCOME", countsInCostOfLiving: false, continuesAfterRetirement: c.continuesAfterRetirement, sortOrder: i },
    });
  }
  for (const name of DEFAULT_PROJECTS) {
    await db.project.upsert({ where: { name }, update: {}, create: { name } });
  }

  if ((await db.user.count()) === 0) {
    const email = (process.env.ADMIN_EMAIL ?? "zak@exemplo.com").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
    const name = process.env.ADMIN_NAME ?? "Zak";
    await db.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true } });
    console.log("[seed] Usuário criado:");
    console.log(`        e-mail: ${email}`);
    if (!process.env.ADMIN_PASSWORD) console.log(`        senha:  ${password}   (troca obrigatória no primeiro acesso)`);
  }
  console.log("[seed] Configuração base pronta.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

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
  // Contas e projetos padrão só num banco vazio: se o Zak renomear um, ele não volta.
  if ((await db.account.count()) === 0) {
    for (const a of DEFAULT_ACCOUNTS) await db.account.create({ data: { ...a, openingDate: OPENING_DATE } });
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
  if ((await db.project.count()) === 0) {
    for (const name of DEFAULT_PROJECTS) await db.project.create({ data: { name } });
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
  // Recuperar acesso: com ADMIN_RESET=1, o e-mail e a senha do único usuário passam a ser
  // ADMIN_EMAIL / ADMIN_PASSWORD (troca de senha obrigatória). Tire a variável depois de entrar.
  if (process.env.ADMIN_RESET === "1") {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const users = await db.user.findMany({ select: { id: true } });
    if (!email || !password || password.length < 10) {
      console.log("[seed] ADMIN_RESET ignorado: defina ADMIN_EMAIL e ADMIN_PASSWORD (10+ caracteres).");
    } else if (users.length !== 1) {
      console.log(`[seed] ADMIN_RESET ignorado: há ${users.length} usuários; só funciona com um.`);
    } else {
      await db.user.update({
        where: { id: users[0].id },
        data: { email, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      });
      await db.session.deleteMany({});
      console.log(`[seed] ADMIN_RESET: acesso redefinido para ${email}. Remova ADMIN_RESET das variáveis depois de entrar.`);
    }
  }
  const emails = (await db.user.findMany({ select: { email: true } })).map((u) => u.email);
  console.log(`[seed] Login: ${emails.join(", ")}`);
  console.log("[seed] Configuração base pronta.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

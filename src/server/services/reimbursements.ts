import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { monthKey } from "@/lib/months";
import { money, requiredDate } from "@/lib/validation/common";
import { AppError, parseInput } from "@/server/errors";

const NO_NAME = "Sem nome";

/** Gastos reembolsáveis pendentes, agrupados por quem deve; e os últimos recebidos. */
export async function listReimbursements() {
  const [pending, settled] = await Promise.all([
    db.transaction.findMany({
      where: { reimbursementStatus: "PENDING" },
      include: { account: true, category: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    db.transaction.findMany({
      where: { reimbursementStatus: "SETTLED", source: "MANUAL" },
      include: { account: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);
  const groups = new Map<string, typeof pending>();
  for (const t of pending) {
    const who = t.reimbursedBy?.trim() || NO_NAME;
    groups.set(who, [...(groups.get(who) ?? []), t]);
  }
  return {
    groups: [...groups.entries()]
      .map(([who, items]) => ({ who, items, totalCents: items.reduce((s, t) => s + t.amountCents, 0) }))
      .sort((a, b) => (a.who === NO_NAME ? 1 : b.who === NO_NAME ? -1 : b.totalCents - a.totalCents)),
    totalCents: pending.reduce((s, t) => s + t.amountCents, 0),
    settled,
  };
}

const settleSchema = z.discriminatedUnion("createIncome", [
  z.object({ createIncome: z.literal(false), ids: z.array(z.string()).min(1) }),
  z.object({
    createIncome: z.literal(true),
    ids: z.array(z.string()).min(1),
    accountId: z.string().min(1, "Escolha a conta."),
    date: requiredDate(),
    amount: money(),
    who: z.string().trim().max(80).optional(),
  }),
]);

/**
 * Marca gastos como reembolsados. Opcionalmente lança a receita do reembolso
 * (categoria Reembolso) na conta onde o dinheiro entrou.
 */
export async function settleReimbursements(raw: unknown) {
  const v = parseInput(settleSchema, raw);
  return db.$transaction(async (tx) => {
    const items = await tx.transaction.findMany({ where: { id: { in: v.ids }, reimbursementStatus: "PENDING" } });
    if (items.length !== v.ids.length) throw new AppError("CONFLICT", "Algum gasto já foi marcado como reembolsado. Atualize a página.");
    if (v.createIncome) {
      const category = await tx.category.upsert({
        where: { name_kind: { name: "Reembolso", kind: "INCOME" } },
        update: {},
        create: { name: "Reembolso", kind: "INCOME", countsInCostOfLiving: false },
      });
      const who = v.who?.trim() || items[0].reimbursedBy || "";
      await tx.transaction.create({
        data: {
          type: "INCOME",
          date: v.date,
          month: monthKey(v.date),
          description: who ? `Reembolso — ${who}` : "Reembolso",
          amountCents: v.amount,
          accountId: v.accountId,
          categoryId: category.id,
        },
      });
    }
    await tx.transaction.updateMany({ where: { id: { in: v.ids } }, data: { reimbursementStatus: "SETTLED" } });
    return items.length;
  });
}

/** Volta um gasto para "a reembolsar". */
export async function reopenReimbursement(id: string) {
  await db.transaction.update({ where: { id }, data: { reimbursementStatus: "PENDING" } });
}

export async function setReimbursedBy(id: string, who: string) {
  await db.transaction.update({ where: { id }, data: { reimbursedBy: who.trim().slice(0, 80) || null } });
}

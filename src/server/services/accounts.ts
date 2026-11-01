import "server-only";
import { db, type Tx } from "@/server/db";
import { computeBalance, type MovementSums } from "@/domain/balances";
import { ADJUSTMENT_CATEGORY } from "@/domain/defaults";
import { monthKey } from "@/lib/months";
import { parseInput, notFound } from "@/server/errors";
import { accountSchema, adjustBalanceSchema } from "@/lib/validation/setup";
import type { Account } from "@/generated/prisma/client";

export type AccountWithBalance = Account & { balanceCents: number };

/** Somas de movimentos por conta, até uma data (inclusive). */
async function movementSums(until?: Date, client: Tx = db): Promise<Map<string, MovementSums>> {
  const dateFilter = until ? { date: { lte: until } } : {};
  const [byAccount, byTarget] = await Promise.all([
    client.transaction.groupBy({ by: ["accountId", "type"], where: dateFilter, _sum: { amountCents: true } }),
    client.transaction.groupBy({ by: ["toAccountId"], where: { ...dateFilter, type: "TRANSFER", toAccountId: { not: null } }, _sum: { amountCents: true } }),
  ]);
  const map = new Map<string, MovementSums>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = { income: 0, expense: 0, transferOut: 0, transferIn: 0 }));
    return s;
  };
  for (const row of byAccount) {
    const s = get(row.accountId);
    const v = row._sum.amountCents ?? 0;
    if (row.type === "INCOME") s.income += v;
    else if (row.type === "EXPENSE") s.expense += v;
    else s.transferOut += v;
  }
  for (const row of byTarget) if (row.toAccountId) get(row.toAccountId).transferIn += row._sum.amountCents ?? 0;
  return map;
}

const ZERO: MovementSums = { income: 0, expense: 0, transferOut: 0, transferIn: 0 };

export async function listAccounts(options: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const [accounts, sums] = await Promise.all([
    db.account.findMany({ where: options.includeArchived ? {} : { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    movementSums(),
  ]);
  return accounts.map((a) => ({ ...a, balanceCents: computeBalance(a.type, a.openingBalanceCents, sums.get(a.id) ?? ZERO) }));
}

/** Saldo (ou dívida, para cartão) de uma conta. */
export async function accountBalance(accountId: string, until?: Date, client: Tx = db): Promise<number> {
  const account = await client.account.findUnique({ where: { id: accountId } });
  if (!account) throw notFound("Conta");
  const sums = await movementSums(until, client);
  return computeBalance(account.type, account.openingBalanceCents, sums.get(accountId) ?? ZERO);
}

function accountData(raw: unknown) {
  const v = parseInput(accountSchema, raw);
  const isCard = v.type === "CREDIT_CARD";
  return {
    name: v.name,
    type: v.type,
    openingBalanceCents: v.openingBalance,
    openingDate: v.openingDate,
    closingDay: isCard ? v.closingDay : null,
    dueDay: isCard ? v.dueDay : null,
  };
}

export async function createAccount(raw: unknown) {
  return db.account.create({ data: accountData(raw) });
}

export async function updateAccount(id: string, raw: unknown) {
  return db.account.update({ where: { id }, data: accountData(raw) });
}

export async function setAccountArchived(id: string, archived: boolean) {
  return db.account.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}

/**
 * Confere o saldo com o valor real: lança a diferença como "Ajuste de saldo"
 * (receita ou despesa explícita). Nunca altera o saldo inicial.
 */
export async function adjustBalance(raw: unknown) {
  const { accountId, realBalance, date } = parseInput(adjustBalanceSchema, raw);
  return db.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: accountId } });
    if (!account) throw notFound("Conta");
    const current = await accountBalance(accountId, undefined, tx);
    // Para cartão o "saldo" é dívida: dívida maior = despesa.
    const diff = account.type === "CREDIT_CARD" ? current - realBalance : realBalance - current;
    if (diff === 0) return null;
    const kind = diff > 0 ? "INCOME" : "EXPENSE";
    const category = await tx.category.upsert({
      where: { name_kind: { name: ADJUSTMENT_CATEGORY, kind } },
      update: {},
      create: { name: ADJUSTMENT_CATEGORY, kind, countsInCostOfLiving: false },
    });
    return tx.transaction.create({
      data: { type: kind, date, month: monthKey(date), description: "Ajuste de saldo", amountCents: Math.abs(diff), accountId, categoryId: category.id },
    });
  });
}

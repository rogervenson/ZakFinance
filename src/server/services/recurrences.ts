import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { isActiveIn, pendingRecurrences, recurrenceDate } from "@/domain/recurrences";
import { toDateInput } from "@/lib/dates";
import { centsToInput } from "@/lib/format";
import { money, optionalId, requiredText } from "@/lib/validation/common";
import { AppError, notFound, parseInput } from "@/server/errors";
import { createTransaction } from "./transactions";

const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido.");

const recurrenceSchema = z
  .object({
    description: requiredText("Descrição", 120),
    type: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
    amount: money(),
    accountId: z.string().min(1, "Escolha a conta."),
    toAccountId: optionalId,
    categoryId: optionalId,
    dayOfMonth: z.coerce.number().int().min(1, "Dia entre 1 e 31.").max(31, "Dia entre 1 e 31."),
    startMonth: monthKeySchema,
    endMonth: z
      .string()
      .nullish()
      .transform((x) => (x ? x : null))
      .refine((x) => x === null || /^\d{4}-\d{2}$/.test(x), "Mês inválido."),
  })
  .superRefine((v, ctx) => {
    if (v.type === "TRANSFER" && !v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Escolha a conta de destino." });
    if (v.type !== "TRANSFER" && !v.categoryId) ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Escolha a categoria." });
    if (v.endMonth && v.endMonth < v.startMonth) ctx.addIssue({ code: "custom", path: ["endMonth"], message: "O fim deve ser depois do início." });
  });

function recurrenceData(raw: unknown) {
  const v = parseInput(recurrenceSchema, raw);
  return {
    description: v.description,
    type: v.type,
    amountCents: v.amount,
    accountId: v.accountId,
    toAccountId: v.type === "TRANSFER" ? v.toAccountId : null,
    categoryId: v.type === "TRANSFER" ? null : v.categoryId,
    dayOfMonth: v.dayOfMonth,
    startMonth: v.startMonth,
    endMonth: v.endMonth,
  };
}

export async function createRecurrence(raw: unknown) {
  return db.recurrence.create({ data: recurrenceData(raw) });
}

export async function updateRecurrence(id: string, raw: unknown) {
  return db.recurrence.update({ where: { id }, data: recurrenceData(raw) });
}

export async function setRecurrenceArchived(id: string, archived: boolean) {
  return db.recurrence.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}

export async function listRecurrences() {
  return db.recurrence.findMany({
    include: { account: true, toAccount: true, category: true },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { dayOfMonth: "asc" }, { description: "asc" }],
  });
}

export interface MonthRecurrence {
  recurrenceId: string;
  description: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  amountCents: number;
  date: string;
  accountId: string;
  accountName: string;
  accountType: string;
  toAccountId: string | null;
  categoryName: string | null;
}

/** Recorrentes de um mês: previstas (a confirmar), confirmadas e puladas. */
export async function listMonthRecurrences(month: string) {
  const [recs, confirmed, skipped] = await Promise.all([
    db.recurrence.findMany({ include: { account: true, category: true } }),
    db.transaction.findMany({ where: { recurrenceMonth: month, recurrenceId: { not: null } }, select: { recurrenceId: true } }),
    db.recurrenceSkip.findMany({ where: { month } }),
  ]);
  const confirmedIds = new Set(confirmed.map((c) => c.recurrenceId!));
  const skippedIds = new Set(skipped.map((s) => s.recurrenceId));
  const like = recs.map((r) => ({ ...r, archived: !!r.archivedAt }));
  const byId = new Map(recs.map((r) => [r.id, r]));
  const view = (id: string): MonthRecurrence => {
    const r = byId.get(id)!;
    return {
      recurrenceId: r.id,
      description: r.description,
      type: r.type,
      amountCents: r.amountCents,
      date: toDateInput(recurrenceDate(month, r.dayOfMonth)),
      accountId: r.accountId,
      accountName: r.account.name,
      accountType: r.account.type,
      toAccountId: r.toAccountId,
      categoryName: r.category?.name ?? null,
    };
  };
  const pending = pendingRecurrences(like, month, { confirmed: confirmedIds, skipped: skippedIds }).map((p) => view(p.recurrenceId));
  const activeIds = like.filter((r) => isActiveIn(r, month)).map((r) => r.id);
  return {
    pending,
    confirmed: activeIds.filter((id) => confirmedIds.has(id)).map(view),
    skipped: activeIds.filter((id) => skippedIds.has(id)).map(view),
  };
}

/** Lança a recorrente no mês (com valor e data ajustáveis). */
export async function confirmRecurrence(id: string, month: string, overrides: { amount?: string; date?: string }) {
  monthKeySchema.parse(month);
  const r = await db.recurrence.findUnique({ where: { id } });
  if (!r) throw notFound("Recorrente");
  const exists = await db.transaction.findFirst({ where: { recurrenceId: id, recurrenceMonth: month } });
  if (exists) throw new AppError("CONFLICT", "Esta recorrente já foi lançada neste mês.");
  const [created] = await createTransaction(
    {
      type: r.type,
      date: overrides.date || toDateInput(recurrenceDate(month, r.dayOfMonth)),
      description: r.description,
      amount: overrides.amount || centsToInput(r.amountCents),
      accountId: r.accountId,
      toAccountId: r.toAccountId,
      categoryId: r.categoryId,
    },
    { recurrenceId: r.id, recurrenceMonth: month },
  );
  await db.recurrenceSkip.deleteMany({ where: { recurrenceId: id, month } });
  return created;
}

export async function skipRecurrence(id: string, month: string) {
  monthKeySchema.parse(month);
  await db.recurrenceSkip.upsert({ where: { recurrenceId_month: { recurrenceId: id, month } }, update: {}, create: { recurrenceId: id, month } });
}

export async function unskipRecurrence(id: string, month: string) {
  await db.recurrenceSkip.deleteMany({ where: { recurrenceId: id, month } });
}

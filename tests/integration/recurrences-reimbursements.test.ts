import { beforeEach, describe, expect, test } from "vitest";
import { db } from "@/server/db";
import { confirmRecurrence, createRecurrence, listMonthRecurrences, skipRecurrence, unskipRecurrence } from "@/server/services/recurrences";
import { listReimbursements, settleReimbursements } from "@/server/services/reimbursements";
import { createTransaction, deleteTransaction, payInvoice, updateTransaction } from "@/server/services/transactions";
import { accountBalance } from "@/server/services/accounts";
import { ids, wipeTransactions } from "./helpers";

let I: Awaited<ReturnType<typeof ids>>;

beforeEach(async () => {
  await wipeTransactions();
  await db.recurrenceSkip.deleteMany();
  await db.recurrence.deleteMany();
  I = await ids();
});

describe("recurrences", () => {
  test("a recurring bill shows as pending, is confirmed once and disappears from pending", async () => {
    const luz = await createRecurrence({ description: "Celesc", type: "EXPENSE", amount: "106,24", accountId: I.checking, categoryId: I.cat("Despesas"), dayOfMonth: "20", startMonth: "2026-01" });
    let month = await listMonthRecurrences("2026-11");
    expect(month.pending.map((p) => p.description)).toEqual(["Celesc"]);
    expect(month.pending[0].date).toBe("2026-11-20");

    await confirmRecurrence(luz.id, "2026-11", { amount: "110,00", date: "2026-11-21" });
    month = await listMonthRecurrences("2026-11");
    expect(month.pending).toHaveLength(0);
    expect(month.confirmed).toHaveLength(1);
    const tx = await db.transaction.findFirstOrThrow({ where: { recurrenceId: luz.id } });
    expect(tx).toMatchObject({ amountCents: 11000, month: "2026-11", recurrenceMonth: "2026-11", description: "Celesc" });

    await expect(confirmRecurrence(luz.id, "2026-11", {})).rejects.toThrow("já foi lançada");
  });

  test("skipping removes from pending; unskip brings it back", async () => {
    const net = await createRecurrence({ description: "Internet", type: "EXPENSE", amount: "112,65", accountId: I.checking, categoryId: I.cat("Despesas"), dayOfMonth: "20", startMonth: "2026-01" });
    await skipRecurrence(net.id, "2026-11");
    expect((await listMonthRecurrences("2026-11")).pending).toHaveLength(0);
    await unskipRecurrence(net.id, "2026-11");
    expect((await listMonthRecurrences("2026-11")).pending).toHaveLength(1);
  });

  test("the Ticket recurrence is an income in the Ticket account", async () => {
    const t = await createRecurrence({ description: "Ticket", type: "INCOME", amount: "954", accountId: I.ticket, categoryId: I.cat("Ticket", "INCOME"), dayOfMonth: "1", startMonth: "2026-11" });
    await confirmRecurrence(t.id, "2026-11", {});
    expect(await accountBalance(I.ticket)).toBe(95400);
  });
});

describe("reimbursements", () => {
  test("pending expenses are grouped by who owes, and settling creates the income", async () => {
    await createTransaction({ type: "EXPENSE", date: "2026-10-08", description: "Gisele", amount: "579", accountId: I.checking, categoryId: I.cat("Reembolsável"), reimbursable: true, reimbursedBy: "Gisele" });
    await createTransaction({ type: "EXPENSE", date: "2026-10-10", description: "farmácia", amount: "21", accountId: I.checking, categoryId: I.cat("Reembolsável"), reimbursable: true, reimbursedBy: "Gisele" });
    await createTransaction({ type: "EXPENSE", date: "2026-10-10", description: "posto", amount: "100", accountId: I.checking, categoryId: I.cat("Reembolsável"), reimbursable: true });
    const list = await listReimbursements();
    expect(list.groups.map((g) => [g.who, g.totalCents, g.items.length])).toEqual([
      ["Gisele", 60000, 2],
      ["Sem nome", 10000, 1],
    ]);

    const gisele = list.groups[0].items.map((i) => i.id);
    await settleReimbursements({ ids: gisele, createIncome: true, accountId: I.checking, date: "2026-10-20", amount: "600,00", who: "Gisele" });
    const income = await db.transaction.findFirstOrThrow({ where: { type: "INCOME" } });
    expect(income).toMatchObject({ amountCents: 60000, description: "Reembolso — Gisele", categoryId: I.cat("Reembolso", "INCOME") });
    expect((await listReimbursements()).groups.map((g) => g.who)).toEqual(["Sem nome"]);
  });

  test("settling without creating an income only marks as received", async () => {
    const [t] = await createTransaction({ type: "EXPENSE", date: "2026-10-10", description: "posto", amount: "100", accountId: I.checking, categoryId: I.cat("Reembolsável"), reimbursable: true });
    await settleReimbursements({ ids: [t.id], createIncome: false });
    expect(await db.transaction.count({ where: { type: "INCOME" } })).toBe(0);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).reimbursementStatus).toBe("SETTLED");
  });
});

describe("review leftovers", () => {
  const card3x = () => ({ type: "EXPENSE", date: "2026-10-13", description: "Notebook", amount: "300,00", accountId: I.card, categoryId: I.cat("Despesas"), installments: 3 });

  test("deleting the whole plan keeps installments in paid invoices and removes the rest", async () => {
    const [first] = await createTransaction(card3x());
    await payInvoice(first.invoiceId!, I.checking, "2026-11-20");
    const result = await deleteTransaction(first.id, { wholePlan: true });
    expect(result).toEqual({ deleted: 2, kept: 1 });
    expect(await db.transaction.count({ where: { installmentPlanId: first.installmentPlanId } })).toBe(1);
  });

  test("reimbursable flag can change on a purchase in a paid invoice", async () => {
    const [first] = await createTransaction(card3x());
    await payInvoice(first.invoiceId!, I.checking, "2026-11-20");
    const updated = await updateTransaction(first.id, { ...card3x(), installments: 1, description: first.description, amount: "100,00", reimbursable: true, reimbursedBy: "Dani" });
    expect(updated).toMatchObject({ reimbursable: true, reimbursedBy: "Dani", reimbursementStatus: "PENDING" });
  });
});

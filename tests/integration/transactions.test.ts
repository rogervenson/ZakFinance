import { beforeEach, describe, expect, test } from "vitest";
import { db } from "@/server/db";
import { createTransaction, deleteTransaction, listTransactions, payInvoice, invoiceTotal, updateTransaction } from "@/server/services/transactions";
import { accountBalance } from "@/server/services/accounts";
import { ids, wipeTransactions } from "./helpers";

let I: Awaited<ReturnType<typeof ids>>;

beforeEach(async () => {
  await wipeTransactions();
  I = await ids();
});

const cardPurchase = (over: Record<string, unknown> = {}) => ({
  type: "EXPENSE",
  date: "2026-10-15",
  description: "Farmácia",
  amount: "300,00",
  accountId: I.card,
  categoryId: I.cat("Saúde"),
  ...over,
});

describe("card purchases", () => {
  test("installments spread across invoices", async () => {
    const txs = await createTransaction(cardPurchase({ installments: 3 }));
    expect(txs).toHaveLength(3);
    expect(txs.map((t) => t.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(txs.map((t) => t.amountCents)).toEqual([10000, 10000, 10000]);
    expect(txs.map((t) => t.description)).toEqual(["Farmácia (1/3)", "Farmácia (2/3)", "Farmácia (3/3)"]);
    const invoices = await db.invoice.findMany({ orderBy: { month: "asc" } });
    expect(invoices.map((i) => i.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(await db.installmentPlan.count()).toBe(1);
  });

  test("paying an invoice marks it PAID and moves money from checking", async () => {
    const [first] = await createTransaction(cardPurchase({ installments: 3 }));
    await payInvoice(first.invoiceId!, I.checking, "2026-11-20");
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: first.invoiceId! } });
    expect(invoice.status).toBe("PAID");
    expect(await invoiceTotal(invoice.id)).toBe(10000);
    expect(await accountBalance(I.checking)).toBe(-10000);
    expect(await accountBalance(I.card)).toBe(20000);
  });

  test("a purchase in a paid invoice locks amount but allows category", async () => {
    const [first] = await createTransaction(cardPurchase({ installments: 3 }));
    await payInvoice(first.invoiceId!, I.checking, "2026-11-20");
    await expect(updateTransaction(first.id, cardPurchase({ amount: "50,00" }))).rejects.toThrow("Fatura já paga");
    const updated = await updateTransaction(first.id, cardPurchase({ amount: "100,00", categoryId: I.cat("Despesas"), description: "Farmácia (1/3)" }));
    expect(updated.categoryId).toBe(I.cat("Despesas"));
    await expect(deleteTransaction(first.id)).rejects.toThrow("Fatura já paga");
  });

  test("changing the date of an open purchase moves it to another invoice", async () => {
    const [tx] = await createTransaction(cardPurchase());
    expect(tx.month).toBe("2026-11");
    const moved = await updateTransaction(tx.id, cardPurchase({ date: "2026-10-01" }));
    expect(moved.month).toBe("2026-10");
  });

  test("deleting the whole plan removes every installment", async () => {
    const [first] = await createTransaction(cardPurchase({ installments: 3 }));
    await deleteTransaction(first.id, { wholePlan: true });
    expect(await db.transaction.count()).toBe(0);
    expect(await db.installmentPlan.count()).toBe(0);
  });
});

describe("other transactions", () => {
  test("debit expense uses the month of its date", async () => {
    const [tx] = await createTransaction({ type: "EXPENSE", date: "2026-10-05", description: "Celesc", amount: "106,24", accountId: I.checking, categoryId: I.cat("Despesas") });
    expect(tx.month).toBe("2026-10");
    expect(tx.invoiceId).toBeNull();
  });

  test("installments are rejected outside a card", async () => {
    await expect(
      createTransaction({ type: "EXPENSE", date: "2026-10-05", description: "x", amount: "10", accountId: I.checking, categoryId: I.cat("Despesas"), installments: 2 }),
    ).rejects.toThrow("Parcelamento só no cartão");
  });

  test("transfer requires a different destination account", async () => {
    await expect(createTransaction({ type: "TRANSFER", date: "2026-10-05", description: "x", amount: "10", accountId: I.checking, toAccountId: I.checking })).rejects.toThrow();
    const [t] = await createTransaction({ type: "TRANSFER", date: "2026-10-05", description: "Poupança", amount: "200", accountId: I.checking, toAccountId: I.savings });
    expect(t.categoryId).toBeNull();
    expect(await accountBalance(I.savings)).toBe(20000);
  });

  test("reimbursable expenses start pending", async () => {
    const [t] = await createTransaction({ type: "EXPENSE", date: "2026-10-05", description: "Gisele", amount: "579", accountId: I.checking, categoryId: I.cat("Reembolsável"), reimbursable: true });
    expect(t.reimbursementStatus).toBe("PENDING");
  });

  test("listTransactions filters by cash month and text, with total", async () => {
    await createTransaction({ type: "EXPENSE", date: "2026-10-05", description: "Celesc", amount: "100", accountId: I.checking, categoryId: I.cat("Despesas") });
    await createTransaction({ type: "EXPENSE", date: "2026-10-06", description: "Giassi", amount: "50", accountId: I.checking, categoryId: I.cat("Mercado") });
    await createTransaction(cardPurchase());
    const oct = await listTransactions({ month: "2026-10" });
    expect(oct.count).toBe(2);
    expect(oct.totalCents).toBe(15000);
    const search = await listTransactions({ month: "2026-10", q: "gias" });
    expect(search.items.map((t) => t.description)).toEqual(["Giassi"]);
  });
});

describe("review fixes", () => {
  test("a refund on the card goes into the invoice and reduces its total", async () => {
    const [buy] = await createTransaction(cardPurchase({ amount: "300,00" }));
    const [refund] = await createTransaction({ type: "INCOME", date: "2026-10-16", description: "Estorno", amount: "50,00", accountId: I.card, categoryId: I.cat("Estorno", "INCOME") });
    expect(refund.invoiceId).toBe(buy.invoiceId);
    expect(await invoiceTotal(buy.invoiceId!)).toBe(25000);
  });

  test("editing only the category of an imported card row keeps its invoice", async () => {
    const [buy] = await createTransaction(cardPurchase());
    // Linha importada: data antiga, mas na fatura de nov/2026 (mês da aba).
    await db.transaction.update({ where: { id: buy.id }, data: { date: new Date("2025-11-20T00:00:00Z"), source: "ZAK26" } });
    const edited = await updateTransaction(buy.id, cardPurchase({ date: "2025-11-20", categoryId: I.cat("Despesas") }));
    expect(edited.month).toBe("2026-11");
    expect(edited.invoiceId).toBe(buy.invoiceId);
  });

  test("balance adjustments do not count as cost of living", async () => {
    const { adjustBalance } = await import("@/server/services/accounts");
    const t = await adjustBalance({ accountId: I.checking, realBalance: "-30,00", date: "2026-10-31" });
    const cat = await db.category.findUniqueOrThrow({ where: { id: t!.categoryId! } });
    expect(cat.name).toBe("Ajuste de saldo");
    expect(cat.countsInCostOfLiving).toBe(false);
  });
});

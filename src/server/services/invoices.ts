import "server-only";
import { db, type Tx } from "@/server/db";
import { invoiceDates } from "@/domain/invoices";
import { today } from "@/lib/dates";
import { addMonthKey, monthKey, monthLabel } from "@/lib/months";
import { parseDateInput } from "@/lib/dates";
import { AppError, notFound } from "@/server/errors";
import type { Account, Invoice, InvoiceStatus } from "@/generated/prisma/client";

export const PAID_LOCK = "Fatura já paga: só é possível alterar descrição, categoria e projeto.";

/** Busca ou cria a fatura do cartão que vence em `month`. */
export async function ensureInvoice(tx: Tx, account: Pick<Account, "id" | "closingDay" | "dueDay">, month: string): Promise<Invoice> {
  const existing = await tx.invoice.findUnique({ where: { accountId_month: { accountId: account.id, month } } });
  if (existing) return existing;
  const { closingDate, dueDate } = invoiceDates(month, account.closingDay ?? 1, account.dueDay ?? 10);
  return tx.invoice.create({ data: { accountId: account.id, month, closingDate, dueDate } });
}

/** Status mostrado: CLOSED quando já passou do fechamento e não foi paga. */
export function displayStatus(invoice: Pick<Invoice, "status" | "closingDate">, now: Date = today()): InvoiceStatus {
  if (invoice.status === "PAID") return "PAID";
  return now.getTime() > invoice.closingDate.getTime() ? "CLOSED" : "OPEN";
}

export async function invoiceTotal(invoiceId: string, client: Tx = db): Promise<number> {
  const sum = await client.transaction.aggregate({ where: { invoiceId, type: "EXPENSE" }, _sum: { amountCents: true } });
  return sum._sum.amountCents ?? 0;
}

/** Paga a fatura com uma transferência da conta escolhida para o cartão. */
export async function payInvoice(invoiceId: string, fromAccountId: string, date: string | Date) {
  const day = typeof date === "string" ? parseDateInput(date) : date;
  if (!day) throw new AppError("VALIDATION", "Data inválida.");
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw notFound("Fatura");
    if (invoice.status === "PAID") throw new AppError("CONFLICT", "Esta fatura já está paga.");
    const from = await tx.account.findUnique({ where: { id: fromAccountId } });
    if (!from || from.type === "CREDIT_CARD") throw new AppError("VALIDATION", "Escolha uma conta para pagar a fatura.");
    const total = await invoiceTotal(invoiceId, tx);
    if (total <= 0) throw new AppError("VALIDATION", "A fatura está vazia.");
    await tx.transaction.create({
      data: {
        type: "TRANSFER",
        date: day,
        month: monthKey(day),
        description: `Pagamento fatura ${monthLabel(invoice.month)}`,
        amountCents: total,
        accountId: fromAccountId,
        toAccountId: invoice.accountId,
        paysInvoiceId: invoice.id,
      },
    });
    return tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: day } });
  });
}

export interface InvoiceSummary {
  id: string;
  accountId: string;
  accountName: string;
  month: string;
  closingDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  totalCents: number;
}

/** Faturas de todos os cartões, com total e status de exibição. */
export async function listInvoices(accountId?: string): Promise<InvoiceSummary[]> {
  const [invoices, totals] = await Promise.all([
    db.invoice.findMany({ where: accountId ? { accountId } : {}, include: { account: true }, orderBy: [{ month: "desc" }] }),
    db.transaction.groupBy({ by: ["invoiceId"], where: { type: "EXPENSE", invoiceId: { not: null } }, _sum: { amountCents: true } }),
  ]);
  const totalBy = new Map(totals.map((t) => [t.invoiceId, t._sum.amountCents ?? 0]));
  return invoices.map((i) => ({
    id: i.id,
    accountId: i.accountId,
    accountName: i.account.name,
    month: i.month,
    closingDate: i.closingDate,
    dueDate: i.dueDate,
    status: displayStatus(i),
    totalCents: totalBy.get(i.id) ?? 0,
  }));
}

/**
 * Comprometido futuro de um cartão: soma das faturas que vencem depois da fatura
 * aberta atual (a primeira não paga cujo fechamento ainda não passou).
 */
export function futureCommitted(invoices: InvoiceSummary[], now: Date = today()): number {
  const open = invoices.filter((i) => i.status !== "PAID" && i.closingDate.getTime() >= now.getTime()).sort((a, b) => a.month.localeCompare(b.month));
  const current = open[0]?.month ?? addMonthKey(monthKey(now), 0);
  return invoices.filter((i) => i.status !== "PAID" && i.month > current).reduce((s, i) => s + i.totalCents, 0);
}

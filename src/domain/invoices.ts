// Regras de fatura do cartão. Uma fatura é identificada pelo mês de VENCIMENTO ("YYYY-MM").
import { addMonthKey, monthKey } from "@/lib/months";

const lastDay = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Dia do mês limitado ao tamanho do mês (ex.: 31 em fevereiro → 28). */
function clampedDate(key: string, day: number): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, Math.min(day, lastDay(y, m - 1))));
}

/** Meses entre o fechamento e o vencimento: 0 se vence no mesmo mês do fechamento, senão 1. */
const dueOffset = (closingDay: number, dueDay: number) => (dueDay > closingDay ? 0 : 1);

/**
 * Mês de vencimento da fatura em que cai uma compra. A compra feita até o dia de
 * fechamento (inclusive) entra no ciclo que fecha naquele mês; depois, no seguinte.
 */
export function invoiceMonthFor(purchaseDate: Date, closingDay: number, dueDay: number): string {
  const key = monthKey(purchaseDate);
  const closing = clampedDate(key, closingDay);
  const closingMonth = purchaseDate.getTime() <= closing.getTime() ? key : addMonthKey(key, 1);
  return addMonthKey(closingMonth, dueOffset(closingDay, dueDay));
}

/** Datas de fechamento e vencimento da fatura que vence em `month`. */
export function invoiceDates(month: string, closingDay: number, dueDay: number): { closingDate: Date; dueDate: Date } {
  const closingMonth = addMonthKey(month, -dueOffset(closingDay, dueDay));
  return { closingDate: clampedDate(closingMonth, closingDay), dueDate: clampedDate(month, dueDay) };
}

export function installmentMonths(firstInvoiceMonth: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addMonthKey(firstInvoiceMonth, i));
}

/** Divide em parcelas iguais; os centavos que sobram vão para a primeira. */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + rest : base));
}

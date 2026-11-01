// Liga linhas do extrato/fatura a lançamentos que já existem (para não duplicar).
import { normalizeDescription } from "@/domain/suggest";

export interface ExistingTx {
  id: string;
  date: Date;
  /** Com sinal do ponto de vista da conta do extrato (+ entrada, − saída). */
  amountCents: number;
  description: string;
  /** Mês da fatura, para compras no cartão. */
  invoiceMonth: string | null;
}

export interface IncomingLine {
  key: string;
  date: Date;
  amountCents: number;
  description: string;
  invoiceMonth: string | null;
}

const DAY = 86_400_000;
const days = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / DAY;

/** Palavras em comum (com 3+ letras), para desempatar. */
function similarity(a: string, b: string) {
  const wa = new Set(normalizeDescription(a).split(" ").filter((w) => w.length >= 3));
  return normalizeDescription(b)
    .split(" ")
    .filter((w) => w.length >= 3 && wa.has(w)).length;
}

/**
 * Mesmo valor (com sinal). No cartão, dentro da mesma fatura; na conta, até `maxDays`
 * de distância. Data mais próxima vence, depois a descrição mais parecida. Cada
 * lançamento existente é usado uma vez só.
 */
export function matchLines(incoming: IncomingLine[], existing: ExistingTx[], opts: { maxDays: number }): Map<string, string> {
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const line of incoming) {
    const candidates = existing.filter((e) => {
      if (used.has(e.id) || e.amountCents !== line.amountCents) return false;
      if (line.invoiceMonth && e.invoiceMonth) return line.invoiceMonth === e.invoiceMonth;
      return days(e.date, line.date) <= opts.maxDays;
    });
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => days(a.date, line.date) - days(b.date, line.date) || similarity(line.description, b.description) - similarity(line.description, a.description));
    used.add(candidates[0].id);
    result.set(line.key, candidates[0].id);
  }
  return result;
}

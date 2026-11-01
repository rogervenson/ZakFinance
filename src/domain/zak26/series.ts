// Detecção de parcelas relançadas à mão: a mesma compra no crédito (descrição e
// data original iguais, valor igual ou quase igual) repetida em abas de meses diferentes.
import { normalizeDescription } from "@/domain/suggest";
import type { ZakRow } from "./parse";

export interface SeriesCandidate {
  key: string;
  description: string;
  installmentCents: number;
  purchaseDate: Date;
  months: string[];
  importKeys: string[];
}

/** Diferença máxima entre parcelas da mesma série (arredondamentos da planilha). */
export const SERIES_TOLERANCE_CENTS = 100;

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export function seriesKey(row: Pick<ZakRow, "description" | "cents" | "date">): string {
  return `${normalizeDescription(row.description)}|${row.cents}|${dateKey(row.date)}`;
}

/** Valor mais frequente (empate: o menor). */
function modeOf(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

export function detectSeries(rows: ZakRow[]): SeriesCandidate[] {
  // 1) Mesma descrição e mesma data de compra.
  const byPurchase = new Map<string, ZakRow[]>();
  for (const r of rows) {
    if (r.payment !== "CREDITO" || r.dateIssue || r.cents <= 0) continue;
    const k = `${normalizeDescription(r.description)}|${dateKey(r.date)}`;
    byPurchase.set(k, [...(byPurchase.get(k) ?? []), r]);
  }

  const out: SeriesCandidate[] = [];
  for (const group of byPurchase.values()) {
    // 2) Dentro do grupo, valores próximos (até R$ 1,00) são a mesma compra.
    const clusters: ZakRow[][] = [];
    for (const r of [...group].sort((a, b) => a.cents - b.cents)) {
      const c = clusters.find((cl) => Math.abs(cl[0].cents - r.cents) <= SERIES_TOLERANCE_CENTS);
      if (c) c.push(r);
      else clusters.push([r]);
    }
    for (const list of clusters) {
      const months = [...new Set(list.map((r) => r.month))].sort();
      if (months.length < 2) continue;
      const sorted = [...list].sort((a, b) => a.month.localeCompare(b.month) || a.row - b.row);
      const installmentCents = modeOf(list.map((r) => r.cents));
      out.push({
        key: seriesKey({ description: sorted[0].description, cents: installmentCents, date: sorted[0].date }),
        description: sorted[0].description,
        installmentCents,
        purchaseDate: sorted[0].date,
        months,
        importKeys: sorted.map((r) => r.importKey),
      });
    }
  }
  return out.sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());
}

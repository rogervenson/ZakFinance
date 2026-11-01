// Detecção de parcelas relançadas à mão: a mesma compra no crédito (descrição,
// valor e data original) repetida em abas de meses diferentes.
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

export function seriesKey(row: Pick<ZakRow, "description" | "cents" | "date">): string {
  return `${normalizeDescription(row.description)}|${row.cents}|${row.date.toISOString().slice(0, 10)}`;
}

export function detectSeries(rows: ZakRow[]): SeriesCandidate[] {
  const groups = new Map<string, ZakRow[]>();
  for (const r of rows) {
    if (r.payment !== "CREDITO" || r.dateIssue) continue;
    const k = seriesKey(r);
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  const out: SeriesCandidate[] = [];
  for (const [key, list] of groups) {
    const months = [...new Set(list.map((r) => r.month))].sort();
    if (months.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.month.localeCompare(b.month) || a.row - b.row);
    out.push({
      key,
      description: sorted[0].description,
      installmentCents: sorted[0].cents,
      purchaseDate: sorted[0].date,
      months,
      importKeys: sorted.map((r) => r.importKey),
    });
  }
  return out.sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());
}

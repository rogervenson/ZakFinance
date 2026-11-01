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

/** Campos de uma linha que a detecção usa (serve para linhas lidas da planilha ou do banco). */
export type SeriesRow = Pick<ZakRow, "importKey" | "row" | "month" | "description" | "cents" | "date" | "dateIssue" | "payment">;

const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1;

export function detectSeries(rows: SeriesRow[]): SeriesCandidate[] {
  // 1) Mesma descrição e mesma data de compra.
  const byPurchase = new Map<string, SeriesRow[]>();
  for (const r of rows) {
    if (r.payment !== "CREDITO" || r.dateIssue || r.cents <= 0) continue;
    const k = `${normalizeDescription(r.description)}|${dateKey(r.date)}`;
    byPurchase.set(k, [...(byPurchase.get(k) ?? []), r]);
  }

  const found: SeriesRow[][] = [];
  for (const group of byPurchase.values()) {
    // 2) Dentro do grupo, valores próximos (até R$ 1,00) são a mesma compra.
    const clusters: SeriesRow[][] = [];
    for (const r of [...group].sort((a, b) => a.cents - b.cents)) {
      const c = clusters.find((cl) => Math.abs(cl[0].cents - r.cents) <= SERIES_TOLERANCE_CENTS);
      if (c) c.push(r);
      else clusters.push([r]);
    }
    for (const list of clusters) if (new Set(list.map((r) => r.month)).size >= 2) found.push(list);
  }

  // 3) Linhas com a data digitada errada: mesma descrição e valor próximo, num mês que
  // preenche um buraco da sequência ou fica logo antes/depois dela.
  const used = new Set(found.flat().map((r) => r.importKey));
  const leftovers = rows.filter((r) => r.payment === "CREDITO" && r.cents > 0 && !used.has(r.importKey));
  for (const list of found) {
    let changed = true;
    while (changed) {
      changed = false;
      const ref = list[0];
      const idx = list.map((r) => monthIndex(r.month));
      const [min, max] = [Math.min(...idx), Math.max(...idx)];
      const extra = leftovers.find(
        (r) =>
          !used.has(r.importKey) &&
          normalizeDescription(r.description) === normalizeDescription(ref.description) &&
          Math.abs(r.cents - ref.cents) <= SERIES_TOLERANCE_CENTS &&
          !idx.includes(monthIndex(r.month)) &&
          monthIndex(r.month) >= min - 1 &&
          monthIndex(r.month) <= max + 1,
      );
      if (extra) {
        list.push(extra);
        used.add(extra.importKey);
        changed = true;
      }
    }
  }

  const out: SeriesCandidate[] = [];
  for (const list of found) {
    const months = [...new Set(list.map((r) => r.month))].sort();
    // Data da compra: a mais repetida na série (ignora a linha com data errada).
    const byDate = new Map<string, number>();
    for (const r of list) byDate.set(dateKey(r.date), (byDate.get(dateKey(r.date)) ?? 0) + 1);
    const purchase = [...list].sort((a, b) => byDate.get(dateKey(b.date))! - byDate.get(dateKey(a.date))!)[0].date;
    const sorted = [...list].sort((a, b) => a.month.localeCompare(b.month) || a.row - b.row);
    const installmentCents = modeOf(list.map((r) => r.cents));
    out.push({
      key: seriesKey({ description: sorted[0].description, cents: installmentCents, date: purchase }),
      description: sorted[0].description,
      installmentCents,
      purchaseDate: purchase,
      months,
      importKeys: sorted.map((r) => r.importKey),
    });
  }
  return out.sort((a, b) => a.purchaseDate.getTime() - b.purchaseDate.getTime());
}

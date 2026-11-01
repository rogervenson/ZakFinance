import { ArrowUp } from "lucide-react";
import { OVER_THRESHOLD } from "@/domain/dashboard";
import { formatBRL } from "@/lib/money";

interface Row {
  categoryId: string;
  name: string;
  cents: number;
  avg3Cents: number;
  overPct: number | null;
}

/**
 * "Para onde foi": uma série (gasto por categoria), barras horizontais de uma cor,
 * valor na ponta, comparação com a média em texto. Sem legenda (série única).
 */
export function CategoryBars({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum gasto neste mês.</p>;
  const max = Math.max(...rows.map((r) => r.cents));
  return (
    <ul className="space-y-3" data-testid="category-bars">
      {rows.map((r) => {
        const over = r.overPct !== null && r.overPct > OVER_THRESHOLD;
        const title = `${r.name}: ${formatBRL(r.cents)} · média dos 3 meses anteriores ${formatBRL(r.avg3Cents)}`;
        return (
          <li key={r.categoryId} title={title} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{r.name}</span>
              {over && (
                <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-foreground">
                  <ArrowUp className="size-3" aria-hidden />
                  {Math.round(r.overPct! * 100)}% acima da média
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 min-w-0 flex-1">
                <div
                  className="h-3 rounded-r-[4px] bg-chart-1 transition-opacity group-hover:opacity-80"
                  style={{ width: `${Math.max(1, (r.cents / max) * 100)}%` }}
                  role="img"
                  aria-label={title}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-sm tabular-nums">{formatBRL(r.cents)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

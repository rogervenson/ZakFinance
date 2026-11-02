import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/** Indicador de topo: rótulo pequeno em caixa alta, valor grande, nota opcional. */
export function StatCard({
  label,
  value,
  hint,
  valueClassName,
  testId,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  valueClassName?: string;
  testId?: string;
}) {
  return (
    <Card data-testid={testId} className="gap-0 border-t-2 border-t-primary px-4 py-3.5">
      <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-1.5 text-[1.6rem] leading-tight font-semibold tracking-tight", valueClassName)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

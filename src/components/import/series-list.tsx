"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmSeriesAction, dismissSeriesAction } from "@/server/actions/import";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { monthLabel } from "@/lib/months";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

interface Series {
  key: string;
  description: string;
  installmentCents: number;
  purchaseDate: string;
  months: string[];
}

function TotalForm({ keys, label, onDone }: { keys: string[]; label: string; onDone?: () => void }) {
  const [total, setTotal] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await confirmSeriesAction(keys, total);
          if (!res.ok) toast.error(res.error);
          else {
            toast.success("Parcelamento confirmado.");
            onDone?.();
          }
        });
      }}
    >
      <Input aria-label={label} placeholder="Total de parcelas" inputMode="numeric" className="w-36" value={total} onChange={(e) => setTotal(e.target.value)} />
      <Button type="submit" size="sm" disabled={pending || !total}>
        Confirmar
      </Button>
    </form>
  );
}

export function SeriesList({ series }: { series: Series[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const toggle = (key: string, on: boolean) => setSelected((s) => (on ? [...s, key] : s.filter((k) => k !== key)));
  const selectedSeries = series.filter((s) => selected.includes(s.key));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parcelamentos detectados</CardTitle>
        <p className="text-sm text-muted-foreground">
          Compras relançadas em vários meses da planilha. Informe o total de parcelas para o sistema numerar as que já vieram e lançar as que faltam. Se o
          sistema separou a mesma compra em duas (nome ou data diferente), marque as duas e use &quot;Juntar&quot;. Se não for parcelamento, use &quot;Não é
          parcelamento&quot;.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {selected.length >= 2 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3 text-sm" data-testid="merge-bar">
            <span className="min-w-0 flex-1">
              Juntar {selectedSeries.map((s) => s.description).join(" + ")} ·{" "}
              {[...new Set(selectedSeries.flatMap((s) => s.months))].sort().map(monthLabel).join(", ")}
            </span>
            <TotalForm keys={selected} label="Total de parcelas das séries juntas" onDone={() => setSelected([])} />
          </div>
        )}
        <ul className="divide-y">
          {series.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-3 py-2" data-testid={`series-${s.description}`}>
              <Checkbox aria-label={`Selecionar ${s.description} para juntar`} checked={selected.includes(s.key)} onCheckedChange={(v) => toggle(s.key, v === true)} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {s.description} · {formatBRL(s.installmentCents)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Compra em {formatDate(s.purchaseDate)} · aparece em {s.months.map(monthLabel).join(", ")}
                </p>
              </div>
              <TotalForm keys={[s.key]} label={`Total de parcelas de ${s.description}`} />
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await dismissSeriesAction(s.key);
                    if (!res.ok) toast.error(res.error);
                  })
                }
              >
                Não é parcelamento
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmSeriesAction } from "@/server/actions/import";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { monthLabel } from "@/lib/months";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Series {
  key: string;
  description: string;
  installmentCents: number;
  purchaseDate: string;
  months: string[];
}

function SeriesRow({ s }: { s: Series }) {
  const [total, setTotal] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-3 py-2" data-testid={`series-${s.description}`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {s.description} · {formatBRL(s.installmentCents)}
        </p>
        <p className="text-xs text-muted-foreground">
          Compra em {formatDate(s.purchaseDate)} · aparece em {s.months.map(monthLabel).join(", ")}
        </p>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await confirmSeriesAction(s.key, total);
            if (!res.ok) toast.error(res.error);
            else toast.success("Parcelamento confirmado.");
          });
        }}
      >
        <Input aria-label={`Total de parcelas de ${s.description}`} placeholder="Total de parcelas" inputMode="numeric" className="w-36" value={total} onChange={(e) => setTotal(e.target.value)} />
        <Button type="submit" size="sm" disabled={pending || !total}>
          Confirmar
        </Button>
      </form>
    </li>
  );
}

export function SeriesList({ series }: { series: Series[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Parcelamentos detectados</CardTitle>
        <p className="text-sm text-muted-foreground">
          Estas compras foram relançadas em vários meses da planilha. Informe o total de parcelas para o sistema numerar as que já vieram e lançar as que faltam
          nas próximas faturas. Se não for parcelamento, é só ignorar.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {series.map((s) => (
            <SeriesRow key={s.key} s={s} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

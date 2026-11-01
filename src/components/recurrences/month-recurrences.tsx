"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { confirmRecurrenceAction, skipRecurrenceAction } from "@/server/actions/recurrences";
import { formatBRL } from "@/lib/money";
import { centsToInput, formatShortDate } from "@/lib/format";
import { monthLabel } from "@/lib/months";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { MonthRecurrence } from "@/server/services/recurrences";

function PendingRow({ r, month }: { r: MonthRecurrence; month: string }) {
  const [amount, setAmount] = useState(centsToInput(r.amountCents));
  const [date, setDate] = useState(r.date);
  const [pending, startTransition] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error);
      else toast.success(ok);
    });
  return (
    <li className="flex flex-wrap items-center gap-2 py-2" data-testid={`planned-${r.description}`}>
      <div className="min-w-40 flex-1">
        <p className="font-medium">{r.description}</p>
        <p className="text-xs text-muted-foreground">
          {r.type === "INCOME" ? "Receita" : r.type === "TRANSFER" ? "Transferência" : r.categoryName} · {r.accountName}
        </p>
      </div>
      <Input aria-label={`Data de ${r.description}`} type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} />
      <Input aria-label={`Valor de ${r.description}`} inputMode="decimal" className="w-28" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Button size="sm" disabled={pending} onClick={() => act(() => confirmRecurrenceAction(r.recurrenceId, month, { amount, date }), "Lançado")}>
        Lançar
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => skipRecurrenceAction(r.recurrenceId, month, true), "Pulada neste mês.")}>
        Pular
      </Button>
    </li>
  );
}

/** Recorrentes previstas do mês, em Lançamentos. */
export function MonthRecurrences({ month, pending, skipped }: { month: string; pending: MonthRecurrence[]; skipped: MonthRecurrence[] }) {
  const [, startTransition] = useTransition();
  if (pending.length === 0 && skipped.length === 0) return null;
  const total = (type: string) => pending.filter((p) => p.type === type).reduce((s, p) => s + p.amountCents, 0);
  return (
    <Card data-testid="month-recurrences">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4" />
          Previstos em {monthLabel(month)}
        </CardTitle>
        {pending.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {pending.length} a confirmar · despesas {formatBRL(total("EXPENSE"))} · receitas {formatBRL(total("INCOME"))}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {pending.map((r) => (
            <PendingRow key={r.recurrenceId} r={r} month={month} />
          ))}
        </ul>
        {skipped.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Pulados:
            {skipped.map((r) => (
              <Button
                key={r.recurrenceId}
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  startTransition(async () => {
                    const res = await skipRecurrenceAction(r.recurrenceId, month, false);
                    if (!res.ok) toast.error(res.error);
                  })
                }
              >
                <Undo2 className="size-3" />
                {r.description} ({formatShortDate(r.date)})
              </Button>
            ))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

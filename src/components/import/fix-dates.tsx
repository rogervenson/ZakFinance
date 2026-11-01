"use client";

import { useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { fixImportedDatesAction } from "@/server/actions/import";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Aviso + botão para corrigir datas digitadas no mês errado na planilha. */
export function FixDates({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Card className="border-amber-500/40" data-testid="fix-dates">
      <CardContent className="flex flex-wrap items-center gap-3">
        <CalendarCheck className="size-5 shrink-0 text-amber-600" />
        <p className="min-w-0 flex-1 text-sm">
          <strong>{count} lançamentos da planilha</strong> estão com a data em outro mês que não o da aba (ex.: 05/09 na aba de outubro). Corrigindo, eles
          mantêm o dia e passam para o mês da aba — assim o saldo por data bate com o extrato do banco. Compras no cartão não mudam.
        </p>
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await fixImportedDatesAction();
              if (!res.ok) toast.error(res.error);
              else toast.success(`${res.data} datas corrigidas.`);
            })
          }
        >
          Corrigir datas
        </Button>
      </CardContent>
    </Card>
  );
}

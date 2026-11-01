"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { archiveRecurrenceAction, saveRecurrenceAction } from "@/server/actions/recurrences";
import { formatBRL } from "@/lib/money";
import { centsToInput } from "@/lib/format";
import { monthLabel } from "@/lib/months";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField } from "@/components/form-field";
import { ConfirmButton } from "@/components/confirm-button";
import type { EntryOptions } from "@/components/transactions/types";

export interface RecurrenceRow {
  id: string;
  description: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  amountCents: number;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  archived: boolean;
}

const TYPE_LABEL = { EXPENSE: "Despesa", INCOME: "Receita", TRANSFER: "Transferência" } as const;

function RecurrenceDialog({ row, options, currentMonth, onClose }: { row: RecurrenceRow | null; options: EntryOptions; currentMonth: string; onClose: () => void }) {
  const checking = options.accounts.find((a) => a.type === "CHECKING")?.id ?? options.accounts[0]?.id ?? "";
  const [v, setV] = useState({
    type: row?.type ?? "EXPENSE",
    description: row?.description ?? "",
    amount: row ? centsToInput(row.amountCents) : "",
    accountId: row?.accountId ?? checking,
    toAccountId: row?.toAccountId ?? "",
    categoryId: row?.categoryId ?? "",
    dayOfMonth: row?.dayOfMonth.toString() ?? "",
    startMonth: row?.startMonth ?? currentMonth,
    endMonth: row?.endMonth ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row ? "Editar recorrente" : "Nova recorrente"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await saveRecurrenceAction(row?.id ?? null, v);
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                if (!res.fieldErrors) toast.error(res.error);
                return;
              }
              toast.success("Recorrente salva.");
              onClose();
            });
          }}
        >
          <FormField id="rec-type" label="Tipo" error={errors.type}>
            <NativeSelect id="rec-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as typeof v.type, categoryId: "" })}>
              {Object.entries(TYPE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField id="rec-desc" label="Descrição" error={errors.description}>
            <Input id="rec-desc" value={v.description} onChange={set("description")} autoFocus />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="rec-amount" label="Valor previsto" error={errors.amount}>
              <Input id="rec-amount" inputMode="decimal" value={v.amount} onChange={set("amount")} />
            </FormField>
            <FormField id="rec-day" label="Dia do mês" error={errors.dayOfMonth}>
              <Input id="rec-day" inputMode="numeric" value={v.dayOfMonth} onChange={set("dayOfMonth")} />
            </FormField>
          </div>
          <FormField id="rec-account" label={v.type === "TRANSFER" ? "De" : "Conta"} error={errors.accountId}>
            <NativeSelect id="rec-account" value={v.accountId} onChange={set("accountId")}>
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {v.type === "TRANSFER" ? (
            <FormField id="rec-to" label="Para" error={errors.toAccountId}>
              <NativeSelect id="rec-to" value={v.toAccountId} onChange={set("toAccountId")}>
                <option value="">Escolha…</option>
                {options.accounts
                  .filter((a) => a.id !== v.accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </NativeSelect>
            </FormField>
          ) : (
            <FormField id="rec-category" label="Categoria" error={errors.categoryId}>
              <NativeSelect id="rec-category" value={v.categoryId} onChange={set("categoryId")}>
                <option value="">Escolha…</option>
                {options.categories
                  .filter((c) => c.kind === v.type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </NativeSelect>
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField id="rec-start" label="Começa em" error={errors.startMonth}>
              <Input id="rec-start" type="month" value={v.startMonth} onChange={set("startMonth")} />
            </FormField>
            <FormField id="rec-end" label="Termina em (opcional)" error={errors.endMonth}>
              <Input id="rec-end" type="month" value={v.endMonth} onChange={set("endMonth")} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecurrencesView({ recurrences, options, currentMonth }: { recurrences: RecurrenceRow[]; options: EntryOptions; currentMonth: string }) {
  const [editing, setEditing] = useState<RecurrenceRow | null | "new">(null);
  const [showArchived, setShowArchived] = useState(false);
  const visible = recurrences.filter((r) => showArchived || !r.archived);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={() => setEditing("new")}>
          <Plus />
          Nova recorrente
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowArchived((x) => !x)}>
          {showArchived ? "Esconder encerradas" : "Ver encerradas"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" data-testid="recurrence-list">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Dia</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Categoria</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Conta</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhuma recorrente ainda. Cadastre salário, Ticket e as contas fixas.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className={cn(r.archived && "opacity-60")} aria-label={r.description}>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.dayOfMonth}</td>
                <td className="px-3 py-2">
                  <span className="block">{r.description}</span>
                  <span className="block text-xs text-muted-foreground">
                    {TYPE_LABEL[r.type]} · desde {monthLabel(r.startMonth)}
                    {r.endMonth ? ` até ${monthLabel(r.endMonth)}` : ""}
                    {r.archived ? " · encerrada" : ""}
                  </span>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">{r.categoryName ?? (r.toAccountName ? `→ ${r.toAccountName}` : "—")}</td>
                <td className="hidden px-3 py-2 md:table-cell">{r.accountName}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.type === "INCOME" && "text-emerald-600 dark:text-emerald-400")}>{formatBRL(r.amountCents)}</td>
                <td className="px-1 py-1 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditing(r)}>
                    <Pencil />
                  </Button>
                  <ConfirmButton
                    label={r.archived ? "Reativar" : "Encerrar"}
                    title={r.archived ? `Reativar ${r.description}?` : `Encerrar ${r.description}?`}
                    description={r.archived ? undefined : "Ela para de aparecer como prevista. O que já foi lançado continua."}
                    onConfirm={() => archiveRecurrenceAction(r.id, !r.archived)}
                    size="icon"
                  >
                    {r.archived ? <ArchiveRestore /> : <Archive />}
                  </ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <RecurrenceDialog key={editing === "new" ? "new" : editing.id} row={editing === "new" ? null : editing} options={options} currentMonth={currentMonth} onClose={() => setEditing(null)} />}
    </div>
  );
}

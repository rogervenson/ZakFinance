"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteTransactionAction } from "@/server/actions/transactions";
import { formatBRL } from "@/lib/money";
import { centsToInput, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TransactionForm } from "./transaction-form";
import type { EntryOptions, TxRow } from "./types";

function Filters({ options }: { options: EntryOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [q, setQ] = useState(search.get("q") ?? "");
  const apply = (key: string, value: string) => {
    const params = new URLSearchParams(search.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("pagina");
    router.push(`${pathname}?${params.toString()}`);
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply("q", q.trim());
        }}
      >
        <Input aria-label="Buscar" placeholder="Buscar descrição…" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <NativeSelect aria-label="Filtrar por conta" value={search.get("conta") ?? ""} onChange={(e) => apply("conta", e.target.value)}>
        <option value="">Todas as contas</option>
        {options.accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Filtrar por categoria" value={search.get("categoria") ?? ""} onChange={(e) => apply("categoria", e.target.value)}>
        <option value="">Todas as categorias</option>
        {options.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.kind === "EXPENSE" ? "despesa" : "receita"})
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Filtrar por projeto" value={search.get("projeto") ?? ""} onChange={(e) => apply("projeto", e.target.value)}>
        <option value="">Todos os projetos</option>
        {options.projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function DeleteDialog({ row, onClose }: { row: TxRow; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const remove = (whole: boolean) =>
    startTransition(async () => {
      const res = await deleteTransactionAction(row.id, whole);
      if (!res.ok) toast.error(res.error);
      else toast.success(res.data > 1 ? `${res.data} parcelas excluídas.` : "Lançamento excluído.");
      onClose();
    });
  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir este lançamento?</AlertDialogTitle>
          <AlertDialogDescription>
            {row.description} — {formatBRL(row.amountCents)}
            {row.isInvoicePayment && ". A fatura volta a ficar em aberto."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {row.installmentPlanId ? (
            <>
              <Button variant="outline" disabled={pending} onClick={() => remove(false)}>
                Só esta parcela
              </Button>
              <Button variant="destructive" disabled={pending} onClick={() => remove(true)}>
                Todas as parcelas
              </Button>
            </>
          ) : (
            <Button variant="destructive" disabled={pending} onClick={() => remove(false)}>
              Excluir
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const sign = (r: TxRow) => (r.type === "INCOME" ? "+" : r.type === "EXPENSE" ? "−" : "");

export function TransactionList({ rows, options, totalCents, incomeCents, count }: { rows: TxRow[]; options: EntryOptions; totalCents: number; incomeCents: number; count: number }) {
  const [editing, setEditing] = useState<TxRow | null>(null);
  const [deleting, setDeleting] = useState<TxRow | null>(null);

  return (
    <div className="space-y-3">
      <Filters options={options} />
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>{count} lançamentos</span>
        <span>
          Despesas <strong className="text-foreground tabular-nums">{formatBRL(totalCents)}</strong>
        </span>
        <span>
          Receitas <strong className="text-foreground tabular-nums">{formatBRL(incomeCents)}</strong>
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table data-testid="transaction-list" className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Data</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Categoria</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Conta</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum lançamento neste filtro.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} aria-label={`${r.description} ${formatBRL(r.amountCents)}`}>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{formatShortDate(r.date)}</td>
                <td className="px-3 py-2">
                  <span className="block">{r.description}</span>
                  <span className="flex flex-wrap gap-1 text-xs text-muted-foreground md:hidden">
                    {r.categoryName ?? (r.toAccountName ? `→ ${r.toAccountName}` : "")} · {r.accountName}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {r.projectName && <Badge variant="outline">{r.projectName}</Badge>}
                    {r.reimbursable && <Badge variant="outline">{r.reimbursementStatus === "SETTLED" ? "reembolsado" : "a reembolsar"}</Badge>}
                    {r.invoicePaid && <Badge variant="secondary">fatura paga</Badge>}
                  </span>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">{r.categoryName ?? (r.toAccountName ? `→ ${r.toAccountName}` : "—")}</td>
                <td className="hidden px-3 py-2 md:table-cell">{r.accountName}</td>
                <td className={cn("px-3 py-2 text-right whitespace-nowrap tabular-nums", r.type === "INCOME" && "text-emerald-600 dark:text-emerald-400")}>
                  {sign(r)}
                  {formatBRL(r.amountCents)}
                </td>
                <td className="px-1 py-1 text-right whitespace-nowrap">
                  {!r.isInvoicePayment && (
                    <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditing(r)}>
                      <Pencil />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" aria-label="Excluir" disabled={r.invoicePaid} onClick={() => setDeleting(r)}>
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <Dialog open onOpenChange={(v) => !v && setEditing(null)}>
          <DialogContent className="max-h-[90svh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar lançamento</DialogTitle>
            </DialogHeader>
            <TransactionForm
              options={options}
              layout="stacked"
              editId={editing.id}
              lockMoney={editing.invoicePaid}
              onDone={() => setEditing(null)}
              initial={{
                type: editing.type,
                date: editing.date.slice(0, 10),
                description: editing.description,
                amount: centsToInput(editing.amountCents),
                accountId: editing.accountId,
                toAccountId: editing.toAccountId ?? "",
                categoryId: editing.categoryId ?? "",
                projectId: editing.projectId ?? "",
                installments: "1",
                reimbursable: editing.reimbursable,
                note: editing.note ?? "",
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {deleting && <DeleteDialog row={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createTransactionAction, updateTransactionAction } from "@/server/actions/transactions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { EntryOptions, TxFormValues } from "./types";

const TYPE_LABEL = { EXPENSE: "Despesa", INCOME: "Receita", TRANSFER: "Transferência" } as const;

export function emptyValues(options: EntryOptions): TxFormValues {
  const checking = options.accounts.find((a) => a.type === "CHECKING") ?? options.accounts[0];
  return {
    type: "EXPENSE",
    date: options.today,
    description: "",
    amount: "",
    accountId: checking?.id ?? "",
    toAccountId: "",
    categoryId: "",
    projectId: "",
    installments: "1",
    reimbursable: false,
    reimbursedBy: "",
    note: "",
  };
}

/**
 * Formulário de lançamento. `layout="row"` é a linha de entrada rápida do desktop;
 * `"stacked"` é usado no celular e no diálogo de edição.
 */
export function TransactionForm({
  options,
  initial,
  editId,
  layout,
  onDone,
  lockMoney = false,
}: {
  options: EntryOptions;
  initial?: TxFormValues;
  editId?: string;
  layout: "row" | "stacked";
  onDone?: () => void;
  lockMoney?: boolean;
}) {
  const [values, setValues] = useState<TxFormValues>(initial ?? emptyValues(options));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const touched = useRef({ categoryId: !!initial, accountId: !!initial });
  const descriptionRef = useRef<HTMLInputElement>(null);
  const prefix = editId ? `edit-${editId}` : `new-${layout}`;

  // Aba aberta de um dia para o outro: a data padrão acompanha o dia (se não foi mudada).
  const defaultDate = useRef(options.today);
  useEffect(() => {
    if (editId) return;
    const refresh = () => {
      const now = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      if (now === defaultDate.current) return;
      const old = defaultDate.current;
      defaultDate.current = now;
      setValues((v) => (v.date === old ? { ...v, date: now } : v));
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [editId]);

  const account = options.accounts.find((a) => a.id === values.accountId);
  const isCard = account?.type === "CREDIT_CARD" && values.type === "EXPENSE";
  const categories = options.categories.filter((c) => c.kind === values.type);

  const set = <K extends keyof TxFormValues>(key: K, value: TxFormValues[K]) => {
    if (key === "categoryId") touched.current.categoryId = true;
    if (key === "accountId") touched.current.accountId = true;
    setValues((v) => ({ ...v, [key]: value }));
  };

  async function suggest() {
    if (editId || !values.description.trim() || values.type === "TRANSFER") return;
    const res = await fetch(`/api/suggest?q=${encodeURIComponent(values.description)}`);
    if (!res.ok) return;
    const s = (await res.json()) as { categoryId: string; accountId: string; projectId: string | null } | null;
    if (!s) return;
    const cat = options.categories.find((c) => c.id === s.categoryId);
    if (!cat) return;
    setValues((v) => ({
      ...v,
      type: cat.kind,
      categoryId: touched.current.categoryId ? v.categoryId : s.categoryId,
      accountId: touched.current.accountId || !options.accounts.some((a) => a.id === s.accountId) ? v.accountId : s.accountId,
      projectId: v.projectId || s.projectId || "",
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const payload = { ...values, installments: isCard ? values.installments || "1" : "1" };
      const res = editId ? await updateTransactionAction(editId, payload) : await createTransactionAction(payload);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        if (!res.fieldErrors) toast.error(res.error);
        return;
      }
      setErrors({});
      toast.success(editId ? "Lançamento salvo." : "Lançado");
      if (editId) {
        onDone?.();
        return;
      }
      // Mantém data, tipo e conta para o próximo lançamento.
      touched.current = { categoryId: false, accountId: false };
      setValues((v) => ({ ...v, description: "", amount: "", installments: "1", categoryId: "", projectId: "", reimbursable: false, reimbursedBy: "", note: "" }));
      descriptionRef.current?.focus();
      onDone?.();
    });
  }

  const err = (k: string) => errors[k]?.[0];
  const field = (key: string, label: string, control: React.ReactNode, className?: string) => (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label htmlFor={`${prefix}-${key}`} className={cn(layout === "row" && "text-xs text-muted-foreground")}>
        {label}
      </Label>
      {control}
      {err(key) && <p className="text-xs text-destructive">{err(key)}</p>}
    </div>
  );
  const id = (k: string) => `${prefix}-${k}`;

  return (
    <form onSubmit={submit} data-testid={editId ? "edit-form" : layout === "row" ? "quick-entry" : "quick-entry-mobile"} className="space-y-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Tipo de lançamento">
        {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={values.type === t ? "default" : "outline"}
            aria-pressed={values.type === t}
            disabled={lockMoney}
            onClick={() => setValues((v) => ({ ...v, type: t, categoryId: "" }))}
          >
            {TYPE_LABEL[t]}
          </Button>
        ))}
      </div>
      <div className={cn("grid gap-3", layout === "row" ? "grid-cols-[8.5rem_minmax(10rem,2fr)_7rem_minmax(8rem,1fr)_minmax(8rem,1fr)_auto] items-start" : "grid-cols-2")}>
        {field("date", "Data", <Input id={id("date")} type="date" value={values.date} disabled={lockMoney} onChange={(e) => set("date", e.target.value)} />, layout === "stacked" ? "col-span-2 sm:col-span-1" : "")}
        {field(
          "description",
          "Descrição",
          <>
            <Input
              id={id("description")}
              ref={descriptionRef}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              onBlur={() => void suggest()}
              list={`${prefix}-descriptions`}
              autoComplete="off"
              autoFocus={layout === "row" && !editId}
            />
            <datalist id={`${prefix}-descriptions`}>
              {options.descriptions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </>,
          layout === "stacked" ? "col-span-2" : "",
        )}
        {field("amount", "Valor", <Input id={id("amount")} inputMode="decimal" value={values.amount} disabled={lockMoney} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" />)}
        {values.type === "TRANSFER"
          ? field(
              "toAccountId",
              "Para",
              <NativeSelect id={id("toAccountId")} value={values.toAccountId} disabled={lockMoney} onChange={(e) => set("toAccountId", e.target.value)}>
                <option value="">Escolha…</option>
                {options.accounts
                  .filter((a) => a.id !== values.accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </NativeSelect>,
            )
          : field(
              "categoryId",
              "Categoria",
              <NativeSelect id={id("categoryId")} value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Escolha…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>,
            )}
        {field(
          "accountId",
          values.type === "TRANSFER" ? "De" : "Conta",
          <NativeSelect id={id("accountId")} value={values.accountId} disabled={lockMoney} onChange={(e) => set("accountId", e.target.value)}>
            {options.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>,
        )}
        {layout === "row" && (
          <div className="space-y-1">
            <span className="block text-xs text-transparent select-none">.</span>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Lançar
            </Button>
          </div>
        )}
      </div>
      <div className={cn("grid gap-3", layout === "row" ? "grid-cols-[7rem_minmax(8rem,14rem)_auto_1fr] items-end" : "grid-cols-2")}>
        {isCard && !editId && field("installments", "Parcelas", <Input id={id("installments")} inputMode="numeric" value={values.installments} onChange={(e) => set("installments", e.target.value)} />)}
        {values.type !== "TRANSFER" &&
          field(
            "projectId",
            "Projeto",
            <NativeSelect id={id("projectId")} value={values.projectId} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">Nenhum</option>
              {options.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>,
          )}
        {values.type === "EXPENSE" && (
          <div className="flex h-9 items-center gap-2 self-end">
            <Checkbox id={id("reimbursable")} checked={values.reimbursable} onCheckedChange={(v) => set("reimbursable", v === true)} />
            <Label htmlFor={id("reimbursable")}>Reembolsável</Label>
          </div>
        )}
        {values.type === "EXPENSE" &&
          values.reimbursable &&
          field("reimbursedBy", "Quem reembolsa", <Input id={id("reimbursedBy")} value={values.reimbursedBy} onChange={(e) => set("reimbursedBy", e.target.value)} />)}
        {layout === "stacked" &&
          field("note", "Observação", <Input id={id("note")} value={values.note} onChange={(e) => set("note", e.target.value)} />, "col-span-2")}
      </div>
      {lockMoney && <p className="text-xs text-muted-foreground">Fatura já paga: valor, data e conta ficam travados.</p>}
      {layout === "stacked" && (
        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {editId ? "Salvar" : "Lançar"}
        </Button>
      )}
    </form>
  );
}

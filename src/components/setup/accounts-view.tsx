"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Scale } from "lucide-react";
import { toast } from "sonner";
import { adjustBalanceAction, archiveAccountAction, saveAccountAction } from "@/server/actions/setup";
import { ACCOUNT_TYPE_LABEL, type AccountKind } from "@/domain/balances";
import { formatBRL } from "@/lib/money";
import { centsToInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField } from "@/components/form-field";
import { ConfirmButton } from "@/components/confirm-button";

export interface AccountRow {
  id: string;
  name: string;
  type: AccountKind;
  balanceCents: number;
  openingBalanceCents: number;
  openingDate: string;
  closingDay: number | null;
  dueDay: number | null;
  archived: boolean;
}

type Errors = Record<string, string[]>;

function AccountDialog({ account, open, onOpenChange, today }: { account: AccountRow | null; open: boolean; onOpenChange: (v: boolean) => void; today: string }) {
  const [values, setValues] = useState(() => ({
    name: account?.name ?? "",
    type: account?.type ?? "CHECKING",
    openingBalance: account ? centsToInput(account.openingBalanceCents) : "0",
    openingDate: account?.openingDate ?? today,
    closingDay: account?.closingDay?.toString() ?? "",
    dueDay: account?.dueDay?.toString() ?? "",
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues({ ...values, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await saveAccountAction(account?.id ?? null, values);
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                if (!res.fieldErrors) toast.error(res.error);
                return;
              }
              toast.success("Conta salva.");
              onOpenChange(false);
            });
          }}
        >
          <FormField id="acc-name" label="Nome" error={errors.name}>
            <Input id="acc-name" value={values.name} onChange={set("name")} autoFocus />
          </FormField>
          <FormField id="acc-type" label="Tipo" error={errors.type}>
            <NativeSelect id="acc-type" value={values.type} onChange={set("type")}>
              {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="acc-opening" label="Saldo inicial" error={errors.openingBalance}>
              <Input id="acc-opening" inputMode="decimal" value={values.openingBalance} onChange={set("openingBalance")} />
            </FormField>
            <FormField id="acc-opening-date" label="Data do saldo inicial" error={errors.openingDate}>
              <Input id="acc-opening-date" type="date" value={values.openingDate} onChange={set("openingDate")} />
            </FormField>
          </div>
          {values.type === "CREDIT_CARD" && (
            <div className="grid grid-cols-2 gap-3">
              <FormField id="acc-closing" label="Dia de fechamento" error={errors.closingDay}>
                <Input id="acc-closing" inputMode="numeric" value={values.closingDay} onChange={set("closingDay")} />
              </FormField>
              <FormField id="acc-due" label="Dia de vencimento" error={errors.dueDay}>
                <Input id="acc-due" inputMode="numeric" value={values.dueDay} onChange={set("dueDay")} />
              </FormField>
            </div>
          )}
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

function AdjustDialog({ account, onClose, today }: { account: AccountRow; onClose: () => void; today: string }) {
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const isCard = account.type === "CREDIT_CARD";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar saldo — {account.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isCard ? "Fatura em aberto" : "Saldo"} no sistema: <strong>{formatBRL(account.balanceCents)}</strong>. A diferença vira um lançamento
          &quot;Ajuste de saldo&quot;, que aparece na lista e pode ser excluído.
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await adjustBalanceAction({ accountId: account.id, realBalance: value, date });
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                if (!res.fieldErrors) toast.error(res.error);
                return;
              }
              toast.success("Saldo ajustado.");
              onClose();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField id="adj-value" label={isCard ? "Fatura real hoje" : "Saldo real hoje"} error={errors.realBalance}>
              <Input id="adj-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            </FormField>
            <FormField id="adj-date" label="Data" error={errors.date}>
              <Input id="adj-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Ajustar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AccountsView({ accounts, today }: { accounts: AccountRow[]; today: string }) {
  const [editing, setEditing] = useState<AccountRow | null | "new">(null);
  const [adjusting, setAdjusting] = useState<AccountRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const visible = accounts.filter((a) => showArchived || !a.archived);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={() => setEditing("new")}>
          <Plus />
          Nova conta
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Esconder arquivadas" : "Ver arquivadas"}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((a) => (
          <Card key={a.id} data-testid={`account-${a.name}`} className={cn(a.archived && "opacity-60")}>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ACCOUNT_TYPE_LABEL[a.type]}
                    {a.type === "CREDIT_CARD" && ` · fecha dia ${a.closingDay}, vence dia ${a.dueDay}`}
                    {a.archived && " · arquivada"}
                  </p>
                </div>
                <p data-testid="balance" className={cn("text-right text-lg font-semibold tabular-nums", a.type !== "CREDIT_CARD" && a.balanceCents < 0 && "text-destructive")}>
                  {formatBRL(a.balanceCents)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button variant="outline" size="sm" onClick={() => setAdjusting(a)}>
                  <Scale />
                  Ajustar saldo
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(a)} aria-label="Editar">
                  <Pencil />
                </Button>
                <ConfirmButton
                  label={a.archived ? "Reativar" : "Arquivar"}
                  title={a.archived ? `Reativar ${a.name}?` : `Arquivar ${a.name}?`}
                  description={a.archived ? undefined : "A conta some das listas, mas o histórico continua."}
                  onConfirm={() => archiveAccountAction(a.id, !a.archived)}
                >
                  {a.archived ? <ArchiveRestore /> : <Archive />}
                </ConfirmButton>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {editing && <AccountDialog key={editing === "new" ? "new" : editing.id} account={editing === "new" ? null : editing} open onOpenChange={(v) => !v && setEditing(null)} today={today} />}
      {adjusting && <AdjustDialog account={adjusting} onClose={() => setAdjusting(null)} today={today} />}
    </div>
  );
}

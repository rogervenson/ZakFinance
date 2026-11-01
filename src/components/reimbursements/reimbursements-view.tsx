"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reopenReimbursementAction, setReimbursedByAction, settleReimbursementsAction } from "@/server/actions/recurrences";
import { formatBRL } from "@/lib/money";
import { centsToInput, formatShortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField } from "@/components/form-field";

interface Item {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  accountName: string;
  reimbursedBy: string;
}
interface Group {
  who: string;
  totalCents: number;
  items: Item[];
}

function WhoInput({ item }: { item: Item }) {
  const [who, setWho] = useState(item.reimbursedBy);
  const [, startTransition] = useTransition();
  return (
    <Input
      aria-label={`Quem reembolsa ${item.description}`}
      placeholder="Quem deve"
      className="h-8 w-32"
      value={who}
      onChange={(e) => setWho(e.target.value)}
      onBlur={() => {
        if (who === item.reimbursedBy) return;
        startTransition(async () => {
          const res = await setReimbursedByAction(item.id, who);
          if (!res.ok) toast.error(res.error);
        });
      }}
    />
  );
}

function SettleDialog({ items, who, accounts, today, onClose }: { items: Item[]; who: string; accounts: { id: string; name: string }[]; today: string; onClose: () => void }) {
  const total = items.reduce((s, i) => s + i.amountCents, 0);
  const [createIncome, setCreateIncome] = useState(true);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(centsToInput(total));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Recebido de {who} · {formatBRL(total)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox id="settle-income" checked={createIncome} onCheckedChange={(v) => setCreateIncome(v === true)} />
            <Label htmlFor="settle-income">Lançar a entrada do dinheiro agora</Label>
          </div>
          {createIncome ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField id="settle-account" label="Entrou na conta" error={errors.accountId}>
                <NativeSelect id="settle-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField id="settle-date" label="Data" error={errors.date}>
                <Input id="settle-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </FormField>
              <FormField id="settle-amount" label="Valor recebido" error={errors.amount}>
                <Input id="settle-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </FormField>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Use quando a entrada já foi lançada (por exemplo, veio na importação ou no extrato).</p>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const ids = items.map((i) => i.id);
                const res = await settleReimbursementsAction(createIncome ? { createIncome, ids, accountId, date, amount, who: who === "Sem nome" ? "" : who } : { createIncome, ids });
                if (!res.ok) {
                  setErrors(res.fieldErrors ?? {});
                  if (!res.fieldErrors) toast.error(res.error);
                  return;
                }
                toast.success("Reembolso registrado.");
                onClose();
              })
            }
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupCard({ group, accounts, today }: { group: Group; accounts: { id: string; name: string }[]; today: string }) {
  const [selected, setSelected] = useState<string[]>(group.items.map((i) => i.id));
  const [settling, setSettling] = useState(false);
  const chosen = group.items.filter((i) => selected.includes(i.id));
  return (
    <Card data-testid={`reimb-${group.who}`}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>{group.who}</CardTitle>
          <p className="text-sm text-muted-foreground tabular-nums">
            {group.items.length} {group.items.length === 1 ? "gasto" : "gastos"} · {formatBRL(group.totalCents)}
          </p>
        </div>
        <Button size="sm" disabled={chosen.length === 0} onClick={() => setSettling(true)}>
          Marcar como recebido
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {group.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 py-2">
              <Checkbox
                aria-label={`Selecionar ${i.description}`}
                checked={selected.includes(i.id)}
                onCheckedChange={(v) => setSelected((s) => (v === true ? [...s, i.id] : s.filter((x) => x !== i.id)))}
              />
              <span className="w-12 text-muted-foreground tabular-nums">{formatShortDate(i.date)}</span>
              <span className="min-w-0 flex-1 truncate">
                {i.description}
                <span className="block text-xs text-muted-foreground">{i.accountName}</span>
              </span>
              <WhoInput item={i} />
              <span className="w-24 text-right tabular-nums">{formatBRL(i.amountCents)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      {settling && <SettleDialog items={chosen} who={group.who} accounts={accounts} today={today} onClose={() => setSettling(false)} />}
    </Card>
  );
}

export function ReimbursementsView({
  groups,
  settled,
  accounts,
  today,
}: {
  groups: Group[];
  settled: { id: string; date: string; description: string; amountCents: number; reimbursedBy: string }[];
  accounts: { id: string; name: string }[];
  today: string;
}) {
  const [, startTransition] = useTransition();
  return (
    <div className="space-y-4">
      {groups.length === 0 && (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          Nada a receber. Marque &quot;Reembolsável&quot; ao lançar um gasto que alguém vai devolver.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <GroupCard key={g.who} group={g} accounts={accounts} today={today} />
        ))}
      </div>
      {settled.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recebidos recentemente</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {settled.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-2">
                  <span className="w-12 text-muted-foreground tabular-nums">{formatShortDate(t.date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.description}
                    {t.reimbursedBy && <span className="text-muted-foreground"> · {t.reimbursedBy}</span>}
                  </span>
                  <span className="tabular-nums">{formatBRL(t.amountCents)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      startTransition(async () => {
                        const res = await reopenReimbursementAction(t.id);
                        if (!res.ok) toast.error(res.error);
                      })
                    }
                  >
                    Voltar para a receber
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

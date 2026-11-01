"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { recordDividendAction, recordOperationAction, saveSnapshotAction } from "@/server/actions/investments";
import { centsToInput } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField } from "@/components/form-field";

type Errors = Record<string, string[]>;

function useSubmit(action: (v: unknown) => Promise<{ ok: boolean; error?: string; fieldErrors?: Errors }>, ok: string, onClose: () => void) {
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const submit = (values: unknown) =>
    startTransition(async () => {
      const res = await action(values);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        if (!res.fieldErrors) toast.error(res.error);
        return;
      }
      toast.success(ok);
      onClose();
    });
  return { errors, pending, submit };
}

export function OperationDialog({ ticker, today, onClose }: { ticker?: string; today: string; onClose: () => void }) {
  const [v, setV] = useState({ type: "BUY", ticker: ticker ?? "", kind: "ACAO", date: today, quantity: "", price: "", fees: "" });
  const { errors, pending, submit } = useSubmit(recordOperationAction, "Operação registrada.", onClose);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compra ou venda</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit({ ...v, kind: ticker ? undefined : v.kind });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField id="op-type" label="Operação" error={errors.type}>
              <NativeSelect id="op-type" value={v.type} onChange={set("type")}>
                <option value="BUY">Compra</option>
                <option value="SELL">Venda</option>
              </NativeSelect>
            </FormField>
            <FormField id="op-ticker" label="Ativo" error={errors.ticker}>
              <Input id="op-ticker" value={v.ticker} onChange={set("ticker")} placeholder="BBAS3" disabled={!!ticker} autoFocus={!ticker} />
            </FormField>
          </div>
          {!ticker && (
            <FormField id="op-kind" label="Tipo (para um ativo novo)" error={errors.kind}>
              <NativeSelect id="op-kind" value={v.kind} onChange={set("kind")}>
                <option value="ACAO">Ação</option>
                <option value="FII">FII</option>
                <option value="ETF">ETF</option>
              </NativeSelect>
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField id="op-date" label="Data" error={errors.date}>
              <Input id="op-date" type="date" value={v.date} onChange={set("date")} />
            </FormField>
            <FormField id="op-qty" label="Quantidade" error={errors.quantity}>
              <Input id="op-qty" inputMode="numeric" value={v.quantity} onChange={set("quantity")} autoFocus={!!ticker} />
            </FormField>
            <FormField id="op-price" label="Preço" error={errors.price}>
              <Input id="op-price" inputMode="decimal" value={v.price} onChange={set("price")} />
            </FormField>
            <FormField id="op-fees" label="Taxas" error={errors.fees}>
              <Input id="op-fees" inputMode="decimal" value={v.fees} onChange={set("fees")} placeholder="0,00" />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DividendDialog({ ticker, tickers, today, accounts, onClose }: { ticker?: string; tickers: string[]; today: string; accounts: { id: string; name: string; type: string }[]; onClose: () => void }) {
  const broker = accounts.find((a) => a.type === "INVESTMENT") ?? accounts[0];
  const [v, setV] = useState({ ticker: ticker ?? tickers[0] ?? "", date: today, amount: "", accountId: broker?.id ?? "" });
  const { errors, pending, submit } = useSubmit(recordDividendAction, "Provento registrado.", onClose);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Provento recebido</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(v);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField id="div-ticker" label="Ativo" error={errors.ticker}>
              <NativeSelect id="div-ticker" value={v.ticker} onChange={set("ticker")}>
                {tickers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="div-amount" label="Valor" error={errors.amount}>
              <Input id="div-amount" inputMode="decimal" value={v.amount} onChange={set("amount")} autoFocus />
            </FormField>
            <FormField id="div-date" label="Data" error={errors.date}>
              <Input id="div-date" type="date" value={v.date} onChange={set("date")} />
            </FormField>
            <FormField id="div-account" label="Entrou na conta" error={errors.accountId}>
              <NativeSelect id="div-account" value={v.accountId} onChange={set("accountId")}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <p className="text-xs text-muted-foreground">Vira uma receita em Dividendos, ligada ao ativo. Se o crédito já veio pelo extrato, não precisa lançar de novo.</p>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SnapshotDialog({
  month,
  classes,
  initial,
  onClose,
}: {
  month: string;
  classes: string[];
  initial: Record<string, number | undefined>;
  onClose: () => void;
}) {
  const [m, setM] = useState(month);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(classes.map((c) => [c, initial[c] !== undefined ? centsToInput(initial[c]!) : ""])));
  const { pending, submit } = useSubmit(saveSnapshotAction, "Patrimônio do mês salvo.", onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Patrimônio do mês</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit({ month: m, values });
          }}
        >
          <FormField id="snap-month" label="Mês">
            <Input id="snap-month" type="month" value={m} onChange={(e) => setM(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            {classes.map((c) => (
              <FormField key={c} id={`snap-${c}`} label={c}>
                <Input id={`snap-${c}`} inputMode="decimal" value={values[c]} onChange={(e) => setValues({ ...values, [c]: e.target.value })} />
              </FormField>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Ações, FIIs e ETF já vêm com o valor atual da carteira. Poupança e Fundos podem vir do extrato da conta.</p>
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

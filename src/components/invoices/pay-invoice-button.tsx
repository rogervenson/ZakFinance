"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { payInvoiceAction } from "@/server/actions/transactions";
import { formatBRL } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField } from "@/components/form-field";

export function PayInvoiceButton({ invoiceId, totalCents, dueDate, accounts }: { invoiceId: string; totalCents: number; dueDate: string; accounts: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(dueDate);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button onClick={() => setOpen(true)}>Pagar fatura</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pagar fatura de {formatBRL(totalCents)}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="pay-account" label="Pagar com">
              <NativeSelect id="pay-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="pay-date" label="Data do pagamento">
              <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await payInvoiceAction(invoiceId, accountId, date);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Fatura paga.");
                  setOpen(false);
                })
              }
            >
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

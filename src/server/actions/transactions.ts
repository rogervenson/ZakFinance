"use server";

import { revalidatePath } from "next/cache";
import { run } from "./run";
import { createTransaction, deleteTransaction, updateTransaction } from "@/server/services/transactions";
import { payInvoice } from "@/server/services/invoices";

function refresh() {
  for (const p of ["/lancamentos", "/", "/faturas", "/contas", "/categorias"]) revalidatePath(p);
}

export async function createTransactionAction(values: unknown) {
  return run(async () => {
    const created = await createTransaction(values);
    refresh();
    return created.length;
  });
}

export async function updateTransactionAction(id: string, values: unknown) {
  return run(async () => {
    await updateTransaction(id, values);
    refresh();
  });
}

export async function deleteTransactionAction(id: string, wholePlan = false) {
  return run(async () => {
    const result = await deleteTransaction(id, { wholePlan });
    refresh();
    return result;
  });
}

export async function payInvoiceAction(invoiceId: string, fromAccountId: string, date: string) {
  return run(async () => {
    await payInvoice(invoiceId, fromAccountId, date);
    refresh();
  });
}

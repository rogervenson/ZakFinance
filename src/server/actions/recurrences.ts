"use server";

import { revalidatePath } from "next/cache";
import { run } from "./run";
import {
  confirmRecurrence,
  createRecurrence,
  setRecurrenceArchived,
  skipRecurrence,
  unskipRecurrence,
  updateRecurrence,
} from "@/server/services/recurrences";
import { reopenReimbursement, setReimbursedBy, settleReimbursements } from "@/server/services/reimbursements";

function refresh() {
  for (const p of ["/", "/lancamentos", "/recorrentes", "/reembolsos", "/faturas", "/contas"]) revalidatePath(p);
}

export async function saveRecurrenceAction(id: string | null, values: unknown) {
  return run(async () => {
    await (id ? updateRecurrence(id, values) : createRecurrence(values));
    refresh();
  });
}

export async function archiveRecurrenceAction(id: string, archived: boolean) {
  return run(async () => {
    await setRecurrenceArchived(id, archived);
    refresh();
  });
}

export async function confirmRecurrenceAction(id: string, month: string, overrides: { amount?: string; date?: string }) {
  return run(async () => {
    await confirmRecurrence(id, month, overrides);
    refresh();
  });
}

export async function skipRecurrenceAction(id: string, month: string, skip: boolean) {
  return run(async () => {
    await (skip ? skipRecurrence(id, month) : unskipRecurrence(id, month));
    refresh();
  });
}

export async function settleReimbursementsAction(values: unknown) {
  return run(async () => {
    const n = await settleReimbursements(values);
    refresh();
    return n;
  });
}

export async function reopenReimbursementAction(id: string) {
  return run(async () => {
    await reopenReimbursement(id);
    refresh();
  });
}

export async function setReimbursedByAction(id: string, who: string) {
  return run(async () => {
    await setReimbursedBy(id, who);
    refresh();
  });
}

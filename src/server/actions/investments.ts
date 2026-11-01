"use server";

import { revalidatePath } from "next/cache";
import { run } from "./run";
import { deleteOperation, recordDividend, recordOperation, saveSnapshotMonth } from "@/server/services/investments";
import { refreshQuotes } from "@/server/services/quotes";

function refresh() {
  for (const p of ["/investimentos", "/", "/lancamentos"]) revalidatePath(p);
}

export async function recordOperationAction(values: unknown) {
  return run(async () => {
    await recordOperation(values);
    refresh();
  });
}

export async function deleteOperationAction(id: string) {
  return run(async () => {
    await deleteOperation(id);
    refresh();
  });
}

export async function recordDividendAction(values: unknown) {
  return run(async () => {
    await recordDividend(values);
    refresh();
  });
}

export async function saveSnapshotAction(values: unknown) {
  return run(async () => {
    await saveSnapshotMonth(values);
    refresh();
  });
}

export async function refreshQuotesAction() {
  return run(async () => {
    const r = await refreshQuotes({ force: true });
    refresh();
    return r;
  });
}

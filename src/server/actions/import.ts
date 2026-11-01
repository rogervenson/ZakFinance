"use server";

import { revalidatePath } from "next/cache";
import { run } from "./run";
import { confirmSeries, undoZakImport } from "@/server/services/zak-import";
import { AppError } from "@/server/errors";

function refresh() {
  for (const p of ["/", "/lancamentos", "/faturas", "/contas", "/importar"]) revalidatePath(p);
}

export async function confirmSeriesAction(seriesKey: string, total: string) {
  return run(async () => {
    await confirmSeries(seriesKey, Number(total));
    refresh();
  });
}

export async function undoImportAction(confirmation: string) {
  return run(async () => {
    if (confirmation.trim().toUpperCase() !== "DESFAZER") throw new AppError("VALIDATION", 'Digite DESFAZER para confirmar.');
    await undoZakImport();
    refresh();
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { run } from "./run";
import { confirmSeries, dismissSeries, undoZakImport } from "@/server/services/zak-import";
import { AppError } from "@/server/errors";

function refresh() {
  for (const p of ["/", "/lancamentos", "/faturas", "/contas", "/importar"]) revalidatePath(p);
}

/** Confirma uma ou mais séries (juntas) como um parcelamento. */
export async function confirmSeriesAction(seriesKeys: string[], total: string) {
  return run(async () => {
    await confirmSeries(seriesKeys, Number(total));
    refresh();
  });
}

export async function dismissSeriesAction(seriesKey: string) {
  return run(async () => {
    await dismissSeries(seriesKey);
    refresh();
  });
}

export async function undoImportAction(confirmation: string) {
  return run(async () => {
    if (confirmation.trim().toUpperCase() !== "DESFAZER") throw new AppError("VALIDATION", "Digite DESFAZER para confirmar.");
    await undoZakImport();
    refresh();
  });
}

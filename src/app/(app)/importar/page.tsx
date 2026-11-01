import type { Metadata } from "next";
import { requireUser } from "@/server/auth/actor";
import { db } from "@/server/db";
import { countDatesOutsideMonth, listPendingSeries } from "@/server/services/zak-import";
import { FixDates } from "@/components/import/fix-dates";
import { getEntryOptions } from "@/server/services/entry-options";
import { StatementImport } from "@/components/import/statement-import";
import { PageHeader } from "@/components/page-header";
import { ImportView } from "@/components/import/import-view";
import { SeriesList } from "@/components/import/series-list";
import { UndoImport } from "@/components/import/undo-import";
import { formatDate } from "@/lib/format";
import { today } from "@/lib/dates";

export const metadata: Metadata = { title: "Importar" };

export default async function ImportPage() {
  await requireUser();
  const [lastRun, imported, series, options, wrongDates] = await Promise.all([
    db.importRun.findFirst({ where: { kind: "ZAK26" }, orderBy: { createdAt: "desc" } }),
    db.transaction.count({ where: { source: "ZAK26" } }),
    listPendingSeries(),
    getEntryOptions(),
    countDatesOutsideMonth(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Importar" description="Extratos e faturas em PDF todo mês; a planilha Zak26 só na carga inicial." />
      {wrongDates > 0 && <FixDates count={wrongDates} />}
      <StatementImport options={options} />
      <h2 className="pt-4 text-lg font-semibold tracking-tight">Planilha Zak26 (carga inicial)</h2>
      <p className="-mt-4 text-sm text-muted-foreground">Feita uma vez. Primeiro você vê a prévia; nada é gravado até clicar em Importar. Rodar de novo não duplica.</p>
      {lastRun && (
        <p className="text-sm text-muted-foreground">
          Última importação em {formatDate(today(lastRun.createdAt))} · {imported} lançamentos vindos da planilha.
        </p>
      )}
      <ImportView />
      {series.length > 0 && (
        <SeriesList
          series={series.map((s) => ({
            key: s.key,
            description: s.description,
            installmentCents: s.installmentCents,
            purchaseDate: s.purchaseDate.toISOString().slice(0, 10),
            months: s.months,
          }))}
        />
      )}
      {imported > 0 && <UndoImport count={imported} />}
    </div>
  );
}

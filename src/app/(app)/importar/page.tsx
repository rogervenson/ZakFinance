import type { Metadata } from "next";
import { requireUser } from "@/server/auth/actor";
import { db } from "@/server/db";
import { listPendingSeries } from "@/server/services/zak-import";
import { PageHeader } from "@/components/page-header";
import { ImportView } from "@/components/import/import-view";
import { SeriesList } from "@/components/import/series-list";
import { UndoImport } from "@/components/import/undo-import";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Importar planilha" };

export default async function ImportPage() {
  await requireUser();
  const [lastRun, imported, series] = await Promise.all([
    db.importRun.findFirst({ where: { kind: "ZAK26" }, orderBy: { createdAt: "desc" } }),
    db.transaction.count({ where: { source: "ZAK26" } }),
    listPendingSeries(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar planilha Zak26"
        description="Carga inicial, feita uma vez. Primeiro você vê a prévia; nada é gravado até clicar em Importar. Rodar de novo não duplica."
      />
      {lastRun && (
        <p className="text-sm text-muted-foreground">
          Última importação em {formatDate(lastRun.createdAt)} · {imported} lançamentos vindos da planilha.
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

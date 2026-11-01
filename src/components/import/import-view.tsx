"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/money";
import { monthLabel } from "@/lib/months";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ZakPreview } from "@/server/services/zak-import";

const ISSUE_LABEL: Record<string, string> = {
  DATA_INVALIDA: "Data inválida ou vazia (usado o dia 1º do mês)",
  DATA_FORA_DO_MES: "Data fora do mês da aba (mantida)",
  TOTAL_DIVERGENTE: "Total da planilha diferente da soma dos itens",
  BLOCO_IGNORADO: "Bloco \"Outros\" (colunas P–R) ignorado",
  VALOR_INVALIDO: "Valor sem descrição",
};

async function send(file: File, mode: "preview" | "confirm") {
  const body = new FormData();
  body.set("file", file);
  body.set("mode", mode);
  const res = await fetch("/api/import/zak26", { method: "POST", body });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Falha ao importar.");
  return json;
}

export function ImportView() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ZakPreview | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);

  const run = async (mode: "preview" | "confirm") => {
    if (!file) return;
    setBusy(mode);
    try {
      if (mode === "preview") setPreview(await send(file, "preview"));
      else {
        const r = (await send(file, "confirm")) as { created: number; skipped: number };
        toast.success(`Importação concluída: ${r.created} lançamentos criados, ${r.skipped} já existiam.`);
        setPreview(null);
        setFile(null);
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar.");
    } finally {
      setBusy(null);
    }
  };

  const grouped = new Map<string, ZakPreview["issues"]>();
  for (const i of preview?.issues ?? []) grouped.set(i.kind, [...(grouped.get(i.kind) ?? []), i]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="zak-file">Arquivo .xlsx (Google Sheets → Arquivo → Fazer download → Microsoft Excel)</Label>
            <Input
              id="zak-file"
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </div>
          <Button variant="outline" disabled={!file || !!busy} onClick={() => run("preview")}>
            {busy === "preview" ? <Loader2 className="animate-spin" /> : <Upload />}
            Pré-visualizar
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Prévia</CardTitle>
              <p className="text-sm text-muted-foreground">
                {preview.totalPlanned - preview.alreadyImported} lançamentos a criar{preview.alreadyImported > 0 ? ` (${preview.alreadyImported} já importados serão pulados)` : ""} · saldo inicial da conta em 01/01:{" "}
                {formatBRL(preview.checkingOpeningCents)} · {preview.snapshots} valores de patrimônio · {preview.holdings} ativos da carteira.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Mês</th>
                    <th className="py-1 pr-3 text-right font-medium">Itens</th>
                    <th className="py-1 pr-3 text-right font-medium">Entradas</th>
                    <th className="py-1 pr-3 text-right font-medium">Crédito</th>
                    <th className="py-1 pr-3 text-right font-medium">Débito</th>
                    <th className="py-1 pr-3 text-right font-medium">Saldo CC (planilha)</th>
                    <th className="py-1 text-right font-medium">Saldo CC (sistema)</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {preview.months.map((m) => {
                    const b = preview.balanceCheck.find((x) => x.month === m.month);
                    const differs = b && Math.abs(b.geralCents - b.computedCents) > 1;
                    return (
                      <tr key={m.month}>
                        <td className="py-1 pr-3">{monthLabel(m.month)}</td>
                        <td className="py-1 pr-3 text-right">{m.rowCount}</td>
                        <td className="py-1 pr-3 text-right">{formatBRL(m.incomeCents)}</td>
                        <td className="py-1 pr-3 text-right">{formatBRL(m.creditCents)}</td>
                        <td className="py-1 pr-3 text-right">{formatBRL(m.debitCents)}</td>
                        <td className="py-1 pr-3 text-right">{b ? formatBRL(b.geralCents) : "—"}</td>
                        <td className={cn("py-1 text-right", differs && "font-medium text-amber-600 dark:text-amber-400")}>{b ? formatBRL(b.computedCents) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Saldos destacados diferem da planilha. Na Zak26, o &quot;Saldo Anterior&quot; de fevereiro foi digitado à mão (R$ 35,00 abaixo do fechamento de janeiro), e essa diferença se arrasta nos meses seguintes; o sistema usa o saldo calculado.
              </p>
            </CardContent>
          </Card>

          {grouped.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pontos de atenção</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[...grouped.entries()].map(([kind, list]) => (
                  <details key={kind}>
                    <summary className="cursor-pointer">
                      {ISSUE_LABEL[kind] ?? kind}: <strong>{list.length}</strong>
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-4 text-xs text-muted-foreground">
                      {list.map((i) => (
                        <li key={`${i.sheet}!${i.cell}`}>
                          {i.sheet}!{i.cell} — {i.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </CardContent>
            </Card>
          )}

          {preview.series.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {preview.series.length} compras parecem parceladas (repetidas em vários meses). Depois de importar, confirme o total de parcelas de cada uma.
            </p>
          )}

          <Button size="lg" disabled={!!busy} onClick={() => run("confirm")}>
            {busy === "confirm" && <Loader2 className="animate-spin" />}
            Importar
          </Button>
        </>
      )}
    </div>
  );
}

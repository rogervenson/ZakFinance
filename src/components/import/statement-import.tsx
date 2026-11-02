"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { EntryOptions } from "@/components/transactions/types";
import type { PreviewRow, StatementPreview } from "@/server/services/statement-import";

interface Decision {
  include: boolean;
  type: PreviewRow["type"];
  categoryId: string;
  toAccountId: string;
  description: string;
}

async function send(file: File, mode: "preview" | "confirm", options?: unknown) {
  const body = new FormData();
  body.set("file", file);
  body.set("mode", mode);
  if (options) body.set("options", JSON.stringify(options));
  const res = await fetch("/api/import/statement", { method: "POST", body });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Falha na importação.");
  return json;
}

const STATUS = {
  NEW: { label: "Novo", variant: "default" },
  MATCHED: { label: "Já lançado", variant: "secondary" },
  IMPORTED: { label: "Importado", variant: "outline" },
} as const;

export function StatementImport({ options }: { options: EntryOptions }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [updateSnapshots, setUpdateSnapshots] = useState(true);
  const [adjustBalance, setAdjustBalance] = useState(false);
  const [onlyNew, setOnlyNew] = useState(true);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);

  const load = async () => {
    if (!file) return;
    setBusy("preview");
    try {
      const p = (await send(file, "preview")) as StatementPreview;
      setPreview(p);
      setDecisions(
        Object.fromEntries(
          p.rows.map((r) => [r.key, { include: r.status === "NEW", type: r.type, categoryId: r.categoryId ?? "", toAccountId: r.toAccountId ?? "", description: r.description }]),
        ),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setBusy(null);
    }
  };

  const chosen = preview ? preview.rows.filter((r) => r.status === "NEW" && decisions[r.key]?.include) : [];
  const missing = chosen.filter((r) => {
    const d = decisions[r.key];
    return d.type === "TRANSFER" ? !d.toAccountId : !d.categoryId;
  });
  const chosenSum = chosen.reduce((s, r) => s + r.amountCents, 0);
  // Parcelas já lançadas que a fatura numera: confirmar liga ao parcelamento mesmo sem nada novo.
  const linkable = preview ? preview.rows.filter((r) => r.status === "MATCHED" && r.installment).length : 0;
  const visible = useMemo(() => (preview ? preview.rows.filter((r) => !onlyNew || r.status === "NEW") : []), [preview, onlyNew]);

  const confirm = async () => {
    if (!file || !preview) return;
    setBusy("confirm");
    try {
      const r = (await send(file, "confirm", {
        decisions: preview.rows.map((row) => ({ key: row.key, ...decisions[row.key], categoryId: decisions[row.key].categoryId || null, toAccountId: decisions[row.key].toAccountId || null })),
        updateSnapshots,
        adjustBalance,
      })) as { created: number; plans: number; adjusted: number | null };
      toast.success(
        `${r.created} lançamentos criados${r.plans ? `, ${r.plans} parcelamentos atualizados` : ""}${r.adjusted ? `, ajuste de ${formatBRL(r.adjusted)}` : ""}.`,
      );
      setPreview(null);
      setFile(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setBusy(null);
    }
  };

  const set = (key: string, patch: Partial<Decision>) => setDecisions((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  const check = preview?.check;
  const isAccount = preview?.kind === "SANTANDER_ACCOUNT";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Extrato da conta ou fatura do cartão</CardTitle>
          <p className="text-sm text-muted-foreground">
            PDF do Santander: extrato consolidado da conta ou fatura do cartão. O sistema reconhece o que já foi lançado e mostra só o que é novo.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="statement-file">Arquivo PDF</Label>
            <Input
              id="statement-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
              }}
            />
          </div>
          <Button variant="outline" disabled={!file || !!busy} onClick={load}>
            {busy === "preview" ? <Loader2 className="animate-spin" /> : <Upload />}
            Ler arquivo
          </Button>
        </CardContent>
      </Card>

      {preview && check && (
        <Card data-testid="statement-preview">
          <CardHeader>
            <CardTitle>{preview.title}</CardTitle>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>
                {preview.rows.filter((r) => r.status === "NEW").length} novos · {preview.rows.filter((r) => r.status === "MATCHED").length} já lançados ·{" "}
                {preview.rows.filter((r) => r.status === "IMPORTED").length} importados antes
              </span>
              <span>
                {check.label}: documento <strong className="text-foreground tabular-nums">{formatBRL(check.documentCents)}</strong> · sistema{" "}
                <strong className="text-foreground tabular-nums">{formatBRL(check.systemCents)}</strong>
              </span>
            </div>
            {preview.issues.map((i) => (
              <p key={i} className="text-sm text-destructive">
                {i}
              </p>
            ))}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox id="only-new" checked={onlyNew} onCheckedChange={(v) => setOnlyNew(v === true)} />
              <Label htmlFor="only-new">Mostrar só os novos</Label>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm" data-testid="statement-rows">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2 font-medium">Data</th>
                    <th className="px-2 py-2 font-medium">Descrição</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 font-medium">Categoria / destino</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        Nada novo neste documento.
                      </td>
                    </tr>
                  )}
                  {visible.map((r) => {
                    const d = decisions[r.key];
                    const editable = r.status === "NEW";
                    const kind = d.type === "INCOME" ? "INCOME" : "EXPENSE";
                    return (
                      <tr key={r.key} className={cn(!editable && "text-muted-foreground")} aria-label={r.description}>
                        <td className="px-2 py-1.5">
                          {editable ? (
                            <Checkbox aria-label={`Importar ${r.description}`} checked={d.include} onCheckedChange={(v) => set(r.key, { include: v === true })} />
                          ) : (
                            <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                          )}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{formatShortDate(r.date)}</td>
                        <td className="min-w-48 px-2 py-1.5">
                          {editable ? (
                            <Input aria-label={`Descrição de ${r.description}`} className="h-8" value={d.description} onChange={(e) => set(r.key, { description: e.target.value })} />
                          ) : (
                            <span>
                              {r.description}
                              {r.matchedDescription && <span className="block text-xs">= {r.matchedDescription}</span>}
                            </span>
                          )}
                          {(r.installment || r.cardholder) && (
                            <span className="mt-0.5 flex gap-1">
                              {r.installment && <Badge variant="outline">parcela {r.installment}</Badge>}
                              {r.cardholder && <Badge variant="outline">{r.cardholder}</Badge>}
                            </span>
                          )}
                        </td>
                        <td className={cn("px-2 py-1.5 text-right whitespace-nowrap tabular-nums", r.amountCents > 0 && isAccount && "text-gain")}>
                          {formatBRL(r.amountCents)}
                        </td>
                        <td className="px-2 py-1.5">
                          {editable && isAccount ? (
                            <NativeSelect aria-label={`Tipo de ${r.description}`} className="h-8" value={d.type} onChange={(e) => set(r.key, { type: e.target.value as Decision["type"], categoryId: "" })}>
                              <option value={r.amountCents > 0 ? "INCOME" : "EXPENSE"}>{r.amountCents > 0 ? "Receita" : "Despesa"}</option>
                              <option value="TRANSFER">Transferência</option>
                            </NativeSelect>
                          ) : (
                            <span className="text-xs">{d.type === "INCOME" ? (isAccount ? "Receita" : "Estorno") : d.type === "TRANSFER" ? "Transferência" : "Despesa"}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {editable &&
                            (d.type === "TRANSFER" ? (
                              <NativeSelect aria-label={`Destino de ${r.description}`} className="h-8" value={d.toAccountId} onChange={(e) => set(r.key, { toAccountId: e.target.value })}>
                                <option value="">{r.amountCents < 0 ? "Para…" : "De…"}</option>
                                {options.accounts
                                  .filter((a) => a.id !== preview.accountId)
                                  .map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.name}
                                    </option>
                                  ))}
                              </NativeSelect>
                            ) : (
                              <NativeSelect
                                aria-label={`Categoria de ${r.description}`}
                                className={cn("h-8", d.include && !d.categoryId && "border-destructive")}
                                value={d.categoryId}
                                onChange={(e) => set(r.key, { categoryId: e.target.value })}
                              >
                                <option value="">Escolha…</option>
                                {options.categories
                                  .filter((c) => c.kind === kind)
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name}
                                    </option>
                                  ))}
                              </NativeSelect>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <p>
                {chosen.length} lançamentos marcados · {formatBRL(chosenSum)}. Depois de importar, {check.label.toLowerCase()} no sistema:{" "}
                <strong className="tabular-nums">{formatBRL(check.systemCents + chosenSum)}</strong>
                {check.systemCents + chosenSum !== check.documentCents && (
                  <span className="text-amber-700 dark:text-amber-400"> (documento: {formatBRL(check.documentCents)}; diferença {formatBRL(check.systemCents + chosenSum - check.documentCents)})</span>
                )}
              </p>
              {isAccount && (
                <>
                  {preview.snapshots.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Checkbox id="upd-snap" checked={updateSnapshots} onCheckedChange={(v) => setUpdateSnapshots(v === true)} />
                      <Label htmlFor="upd-snap">
                        Atualizar patrimônio de {preview.month}: {preview.snapshots.map((s) => `${s.assetClass} ${formatBRL(s.cents)}`).join(" · ")}
                      </Label>
                    </div>
                  )}
                  {check.systemCents + chosenSum !== check.documentCents && (
                    <div className="flex items-center gap-2">
                      <Checkbox id="adj-bal" checked={adjustBalance} onCheckedChange={(v) => setAdjustBalance(v === true)} />
                      <Label htmlFor="adj-bal">Lançar um &quot;Ajuste de saldo&quot; para o saldo do sistema ficar igual ao do extrato</Label>
                    </div>
                  )}
                </>
              )}
              {missing.length > 0 && <p className="text-destructive">Escolha categoria ou destino para {missing.length} lançamento(s) marcado(s).</p>}
            </div>
            <Button size="lg" disabled={!!busy || missing.length > 0 || (chosen.length === 0 && linkable === 0)} onClick={confirm}>
              {busy === "confirm" && <Loader2 className="animate-spin" />}
              {chosen.length > 0 ? `Importar ${chosen.length} lançamentos` : linkable > 0 ? `Atualizar ${linkable} parcelamentos` : "Nada a importar"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

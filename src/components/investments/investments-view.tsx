"use client";

import { useState, useTransition } from "react";
import { ArrowDownRight, ArrowUpRight, Coins, Plus, RefreshCw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { deleteOperationAction, refreshQuotesAction } from "@/server/actions/investments";
import { KIND_LABEL, type AssetKind, type HoldingView } from "@/domain/investments";
import { formatBRL } from "@/lib/money";
import { formatShortDate } from "@/lib/format";
import { monthLabel } from "@/lib/months";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DividendDialog, OperationDialog, SnapshotDialog } from "./dialogs";
import { PatrimonyChart } from "./patrimony-chart";

type Holding = HoldingView & { changePct: number | null; realizedCents: number };
interface Totals {
  investedCents: number;
  valueCents: number;
  gainCents: number;
  dividendsCents: number;
}
interface Props {
  today: string;
  currentMonth: string;
  classes: string[];
  accounts: { id: string; name: string; type: string }[];
  portfolio: {
    holdings: Holding[];
    totals: Totals & { byKind: Record<AssetKind, Totals> };
    realizedCents: number;
    usdCents: number | null;
    lastFetch: string | null;
    quoteError: string[];
    operations: { id: string; ticker: string; type: "BUY" | "SELL"; date: string; quantity: number; priceCents: number; feesCents: number; realizedCents: number | null }[];
  };
  snapshots: { month: string; values: Record<string, number>; carried: string[]; totalCents: number }[];
}

const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const tone = (v: number | null) => (v === null || v === 0 ? "" : v > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive");

function Stat({ label, value, hint, className }: { label: string; value: string; hint?: React.ReactNode; className?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", className)}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function InvestmentsView({ today, currentMonth, classes, accounts, portfolio, snapshots }: Props) {
  const [dialog, setDialog] = useState<{ kind: "op" | "div"; ticker?: string } | { kind: "snap" } | null>(null);
  const [pending, startTransition] = useTransition();
  const t = portfolio.totals;
  const last = snapshots.at(-1);
  const lastOpByTicker = new Map<string, string>();
  for (const o of portfolio.operations) if (!lastOpByTicker.has(o.ticker)) lastOpByTicker.set(o.ticker, o.id);

  // Valores sugeridos para o patrimônio do mês: carteira atual + último valor das demais classes.
  const snapInitial: Record<string, number | undefined> = {};
  for (const c of classes) {
    for (let i = snapshots.length - 1; i >= 0 && snapInitial[c] === undefined; i--) snapInitial[c] = snapshots[i].values[c];
  }
  snapInitial["Ações"] = t.byKind.ACAO.valueCents;
  snapInitial["FIIs"] = t.byKind.FII.valueCents;
  snapInitial["ETF"] = t.byKind.ETF.valueCents;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setDialog({ kind: "op" })}>
          <Plus />
          Compra ou venda
        </Button>
        <Button variant="outline" onClick={() => setDialog({ kind: "div" })} disabled={portfolio.holdings.length === 0}>
          <Coins />
          Provento
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await refreshQuotesAction();
              if (!res.ok) toast.error(res.error);
              else if (res.data.failed.length) toast.warning(`Sem cotação agora para: ${res.data.failed.join(", ")}. Mantida a última.`);
              else toast.success("Cotações atualizadas.");
            })
          }
        >
          <RefreshCw className={cn(pending && "animate-spin")} />
          Atualizar cotações
        </Button>
        <span className="text-xs text-muted-foreground">
          {portfolio.lastFetch ? `Cotações de ${new Date(portfolio.lastFetch).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}` : "Sem cotações ainda"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Carteira (ações, FIIs, ETF)" value={formatBRL(t.valueCents)} hint={`investido ${formatBRL(t.investedCents)}`} />
        <Stat label="Valorização" value={formatBRL(t.gainCents)} className={tone(t.gainCents)} hint={pct(t.investedCents ? t.gainCents / t.investedCents : null)} />
        <Stat
          label="Proventos recebidos"
          value={formatBRL(t.dividendsCents)}
          hint={`retorno com proventos ${pct(t.investedCents ? (t.gainCents + t.dividendsCents) / t.investedCents : null)}`}
        />
        <Stat
          label="Patrimônio total"
          value={last ? formatBRL(last.totalCents) : "—"}
          hint={
            last
              ? `${monthLabel(last.month)}${portfolio.usdCents ? ` · US$ ${(last.totalCents / portfolio.usdCents).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} (dólar ${formatBRL(portfolio.usdCents)})` : ""}`
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Carteira</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="portfolio">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Ativo</th>
                <th className="py-2 pr-3 text-right font-medium">Qtd</th>
                <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Preço médio</th>
                <th className="py-2 pr-3 text-right font-medium">Cotação</th>
                <th className="py-2 pr-3 text-right font-medium">Valor</th>
                <th className="py-2 pr-3 text-right font-medium">Valorização</th>
                <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">Proventos</th>
                <th className="hidden py-2 pr-3 text-right font-medium md:table-cell">Retorno c/ prov.</th>
                <th className="py-2" />
              </tr>
            </thead>
            {(["ACAO", "FII", "ETF"] as AssetKind[]).map((kind) => {
              const list = portfolio.holdings.filter((h) => h.kind === kind);
              if (list.length === 0) return null;
              const k = t.byKind[kind];
              return (
                <tbody key={kind} className="divide-y border-t">
                  {list.map((h) => (
                    <tr key={h.ticker} aria-label={h.ticker}>
                      <td className="py-2 pr-3 font-medium">{h.ticker}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{h.quantity.toLocaleString("pt-BR")}</td>
                      <td className="hidden py-2 pr-3 text-right tabular-nums sm:table-cell">{formatBRL(h.avgPriceCents)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {h.quoteMissing ? <span className="text-muted-foreground">—</span> : formatBRL(h.priceCents)}
                        {h.changePct !== null && (
                          <span className={cn("ml-1 inline-flex items-center text-xs", tone(h.changePct))}>
                            {h.changePct >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                            {Math.abs(h.changePct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatBRL(h.valueCents)}</td>
                      <td className={cn("py-2 pr-3 text-right tabular-nums", tone(h.gainCents))}>
                        {formatBRL(h.gainCents)}
                        <span className="block text-xs">{pct(h.gainPct)}</span>
                      </td>
                      <td className="hidden py-2 pr-3 text-right tabular-nums md:table-cell">{formatBRL(h.dividendsCents)}</td>
                      <td className={cn("hidden py-2 pr-3 text-right tabular-nums md:table-cell", tone(h.totalReturnPct))}>{pct(h.totalReturnPct)}</td>
                      <td className="py-1 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "op", ticker: h.ticker })}>
                          Operar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "div", ticker: h.ticker })}>
                          Provento
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 text-xs">
                    <td className="py-1.5 pr-3 font-medium" colSpan={2}>
                      {KIND_LABEL[kind]}
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td />
                    <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{formatBRL(k.valueCents)}</td>
                    <td className={cn("py-1.5 pr-3 text-right tabular-nums", tone(k.gainCents))}>{pct(k.investedCents ? k.gainCents / k.investedCents : null)}</td>
                    <td className="hidden py-1.5 pr-3 text-right tabular-nums md:table-cell">{formatBRL(k.dividendsCents)}</td>
                    <td className={cn("hidden py-1.5 pr-3 text-right tabular-nums md:table-cell", tone(k.gainCents + k.dividendsCents))}>
                      {pct(k.investedCents ? (k.gainCents + k.dividendsCents) / k.investedCents : null)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              );
            })}
          </table>
          {portfolio.holdings.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum ativo. Importe a planilha ou registre uma compra.</p>}
          {portfolio.realizedCents !== 0 && <p className="mt-3 text-xs text-muted-foreground">Lucro realizado em vendas registradas aqui: {formatBRL(portfolio.realizedCents)}.</p>}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>Patrimônio total</CardTitle>
              <p className="text-xs text-muted-foreground">Soma de poupança, fundos, ações, FIIs, ETF e previdência, mês a mês. Em itálico: último valor conhecido, repetido.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "snap" })}>
              Registrar {monthLabel(currentMonth)}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <PatrimonyChart data={snapshots} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="snapshots">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Mês</th>
                    {classes.map((c) => (
                      <th key={c} className="hidden py-1.5 pr-3 text-right font-medium md:table-cell">
                        {c}
                      </th>
                    ))}
                    <th className="py-1.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y tabular-nums">
                  {[...snapshots].reverse().map((s) => (
                    <tr key={s.month}>
                      <td className="py-1.5 pr-3">{monthLabel(s.month)}</td>
                      {classes.map((c) => (
                        <td key={c} className={cn("hidden py-1.5 pr-3 text-right md:table-cell", s.carried.includes(c) && "text-muted-foreground italic")} title={s.carried.includes(c) ? "Último valor conhecido (não informado neste mês)" : undefined}>
                          {s.values[c] !== undefined ? formatBRL(s.values[c]) : <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                      <td className="py-1.5 text-right font-medium">{formatBRL(s.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimas operações</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolio.operations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma compra ou venda registrada ainda.</p>
            ) : (
              <ul className="divide-y text-sm">
                {portfolio.operations.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 py-2">
                    <span className="w-12 text-muted-foreground tabular-nums">{formatShortDate(o.date)}</span>
                    <span className="min-w-0 flex-1">
                      <Badge variant={o.type === "BUY" ? "secondary" : "outline"}>{o.type === "BUY" ? "Compra" : "Venda"}</Badge> {o.ticker} · {o.quantity} × {formatBRL(o.priceCents)}
                      {o.realizedCents !== null && <span className={cn("block text-xs", tone(o.realizedCents))}>lucro {formatBRL(o.realizedCents)}</span>}
                    </span>
                    {lastOpByTicker.get(o.ticker) === o.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Desfazer operação de ${o.ticker}`}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await deleteOperationAction(o.id);
                            if (!res.ok) toast.error(res.error);
                            else toast.success("Operação desfeita.");
                          })
                        }
                      >
                        <Undo2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {dialog?.kind === "op" && <OperationDialog ticker={dialog.ticker} today={today} onClose={() => setDialog(null)} />}
      {dialog?.kind === "div" && (
        <DividendDialog ticker={dialog.ticker} tickers={portfolio.holdings.map((h) => h.ticker)} today={today} accounts={accounts} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "snap" && <SnapshotDialog month={currentMonth} classes={classes} initial={snapInitial} onClose={() => setDialog(null)} />}
    </div>
  );
}

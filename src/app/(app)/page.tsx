import Link from "next/link";
import { requireUser } from "@/server/auth/actor";
import { getDashboard } from "@/server/services/dashboard";
import { currentMonthKey, monthLabel } from "@/lib/months";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthPicker } from "@/components/transactions/month-picker";
import { CategoryBars } from "@/components/dashboard/category-bars";

function Stat({ label, value, hint, testId, tone }: { label: string; value: string; hint?: string; testId: string; tone?: "negative" }) {
  return (
    <Card data-testid={testId}>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", tone === "negative" && "text-destructive")}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage(props: { searchParams: Promise<{ mes?: string }> }) {
  await requireUser();
  const { mes } = await props.searchParams;
  const current = currentMonthKey();
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : current;
  const d = await getDashboard(month);
  const s = d.summary;
  const isCurrent = month === current;

  return (
    <div className="space-y-5">
      <PageHeader title="Painel" description={isCurrent ? "Resumo do mês atual." : `Resumo de ${monthLabel(month)}.`} actions={<MonthPicker month={month} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          testId="stat-income"
          label={`Entradas · ${monthLabel(month)}`}
          value={formatBRL(s.incomeCents)}
          hint={s.benefitsCents > 0 ? `+ ${formatBRL(s.benefitsCents)} em benefícios (Ticket)` : undefined}
        />
        <Stat
          testId="stat-expense"
          label={`Saídas · ${monthLabel(month)}`}
          value={formatBRL(s.expenseCents)}
          hint={s.investedCents > 0 ? `+ ${formatBRL(s.investedCents)} investidos` : undefined}
        />
        <Stat
          testId="stat-left"
          label="Sobra prevista (hoje)"
          value={formatBRL(d.sobraPrevistaCents)}
          tone={d.sobraPrevistaCents < 0 ? "negative" : undefined}
          hint={[
            `Conta ${formatBRL(d.checkingCents)}`,
            `− ${d.dueCount === 1 ? "1 fatura" : `${d.dueCount} faturas`}`,
            d.upcomingOutCents ? `− ${formatBRL(d.upcomingOutCents)} em contas previstas` : null,
            d.upcomingInCents ? `+ ${formatBRL(d.upcomingInCents)} a receber` : null,
          ]
            .filter(Boolean)
            .join(" ") + ` até ${formatDate(d.nowMonthEnd)}`}
        />
        <Stat
          testId="stat-invoice"
          label="Fatura aberta"
          value={d.openInvoice ? formatBRL(d.openInvoice.totalCents) : "—"}
          hint={d.openInvoice ? `vence ${formatDate(d.openInvoice.dueDate)}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Para onde foi</CardTitle>
            <p className="text-xs text-muted-foreground">Gastos por categoria em {monthLabel(month)}, comparados com a média dos 3 meses anteriores.</p>
          </CardHeader>
          <CardContent>
            <CategoryBars rows={s.byCategory} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Custo de vida</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-2xl font-semibold tabular-nums">{formatBRL(s.costOfLivingCents)}</p>
              <p className="text-xs text-muted-foreground">
                neste mês, sem projetos e reembolsáveis · média de 12 meses {formatBRL(d.avgCostOfLivingCents)}
              </p>
            </CardContent>
          </Card>

          {d.patrimony && (
            <Card data-testid="patrimony">
              <CardHeader>
                <CardTitle>Patrimônio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="text-2xl font-semibold tabular-nums">{formatBRL(d.patrimony.cents)}</p>
                <p className="text-xs text-muted-foreground">em {monthLabel(d.patrimony.month)}</p>
                {d.coverageYears !== null && (
                  <p className="pt-1">
                    Cobre <strong>{d.coverageYears.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos</strong> do seu custo de vida.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {s.byProject.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Projetos no mês</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm">
                  {s.byProject.map((p) => (
                    <li key={p.projectId} className="flex justify-between gap-2">
                      <Link href={`/lancamentos?mes=${month}&projeto=${p.projectId}`} className="hover:underline">
                        {p.name}
                      </Link>
                      <span className="tabular-nums">{formatBRL(p.cents)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {d.pendingReimbursementCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>A reembolsar</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="text-xl font-semibold tabular-nums">{formatBRL(d.pendingReimbursementCents)}</p>
                <p className="text-xs text-muted-foreground">{d.pendingReimbursementCount} gastos aguardando reembolso</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/actor";
import { listTransactions } from "@/server/services/transactions";
import { getEntryOptions } from "@/server/services/entry-options";
import { listMonthRecurrences } from "@/server/services/recurrences";
import { MonthRecurrences } from "@/components/recurrences/month-recurrences";
import { currentMonthKey } from "@/lib/months";
import { toDateInput } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { QuickEntry } from "@/components/transactions/quick-entry";
import { MonthPicker } from "@/components/transactions/month-picker";
import { TransactionList } from "@/components/transactions/transaction-list";
import type { TxRow } from "@/components/transactions/types";

export const metadata: Metadata = { title: "Lançamentos" };

type Search = { mes?: string; q?: string; conta?: string; categoria?: string; projeto?: string; pagina?: string };

export default async function TransactionsPage(props: { searchParams: Promise<Search> }) {
  await requireUser();
  const s = await props.searchParams;
  const validMonth = s.mes && /^\d{4}-\d{2}$/.test(s.mes) ? s.mes : null;
  // Com busca e sem mês escolhido, procura em todos os meses.
  const allMonths = !!s.q && !validMonth;
  const month = validMonth ?? currentMonthKey();
  const page = Math.max(1, Number(s.pagina) || 1);

  const [options, result, recurrences] = await Promise.all([
    getEntryOptions(),
    listTransactions({ month: allMonths ? undefined : month, q: s.q, accountId: s.conta, categoryId: s.categoria, projectId: s.projeto, page }),
    allMonths ? null : listMonthRecurrences(month),
  ]);

  const rows: TxRow[] = result.items.map((t) => ({
    id: t.id,
    type: t.type,
    date: toDateInput(t.date),
    description: t.description,
    amountCents: t.amountCents,
    accountId: t.accountId,
    accountName: t.account.name,
    toAccountId: t.toAccountId,
    toAccountName: t.toAccount?.name ?? null,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    projectId: t.projectId,
    projectName: t.project?.name ?? null,
    installmentPlanId: t.installmentPlanId,
    reimbursable: t.reimbursable,
    reimbursementStatus: t.reimbursementStatus,
    reimbursedBy: t.reimbursedBy,
    note: t.note,
    invoicePaid: t.invoice?.status === "PAID",
    isInvoicePayment: !!t.paysInvoiceId,
  }));
  const pages = Math.ceil(result.count / result.pageSize);
  const pageHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(s).filter(([, v]) => typeof v === "string") as [string, string][]);
    params.set("pagina", String(p));
    return `/lancamentos?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lançamentos"
        description="Compras no cartão aparecem no mês da fatura."
        actions={allMonths ? <span className="text-sm text-muted-foreground">Todos os meses</span> : <MonthPicker month={month} />}
      />
      <QuickEntry options={options} />
      {recurrences && <MonthRecurrences month={month} pending={recurrences.pending} skipped={recurrences.skipped} />}
      <TransactionList rows={rows} options={options} totalCents={result.totalCents} incomeCents={result.incomeCents} count={result.count} />
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)}>Anterior</Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            Página {page} de {pages}
          </span>
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)}>Próxima</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { requireUser } from "@/server/auth/actor";
import { db } from "@/server/db";
import { getPortfolio, listSnapshots, ASSET_CLASSES } from "@/server/services/investments";
import { currentMonthKey } from "@/lib/months";
import { toDateInput, today } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { InvestmentsView } from "@/components/investments/investments-view";

export const metadata: Metadata = { title: "Investimentos" };

export default async function InvestmentsPage() {
  await requireUser();
  const [portfolio, snapshots, accounts] = await Promise.all([
    getPortfolio(),
    listSnapshots(),
    db.account.findMany({ where: { archivedAt: null, type: { not: "CREDIT_CARD" } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <>
      <PageHeader title="Investimentos" description="Carteira com cotações da B3 (atualizadas sozinhas a cada 6 horas) e patrimônio mês a mês." />
      <InvestmentsView
        today={toDateInput(today())}
        currentMonth={currentMonthKey()}
        classes={[...ASSET_CLASSES]}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }))}
        portfolio={{
          holdings: portfolio.holdings,
          totals: portfolio.totals,
          realizedCents: portfolio.realizedCents,
          usdCents: portfolio.usdCents,
          lastFetch: portfolio.lastFetch?.toISOString() ?? null,
          quoteError: portfolio.quoteError,
          operations: portfolio.operations.map((o) => ({
            id: o.id,
            ticker: o.ticker,
            type: o.type,
            date: toDateInput(o.date),
            quantity: o.quantity,
            priceCents: o.priceCents,
            feesCents: o.feesCents,
            realizedCents: o.realizedCents,
          })),
        }}
        snapshots={snapshots}
      />
    </>
  );
}

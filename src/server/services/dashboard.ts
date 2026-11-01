import "server-only";
import { db } from "@/server/db";
import { coverageYears, latestPatrimony, summarizeMonth, type DashTx } from "@/domain/dashboard";
import { addMonthKey, currentMonthKey, monthEnd } from "@/lib/months";
import { today } from "@/lib/dates";
import { listAccounts } from "./accounts";
import { listInvoices } from "./invoices";

export async function getDashboard(month: string) {
  const window3 = [1, 2, 3].map((n) => addMonthKey(month, -n));
  const window12 = Array.from({ length: 12 }, (_, i) => addMonthKey(month, -(i + 1)));

  const [txs, history, colRows, categories, projects, accounts, invoices, pendingReimb, snapshots] = await Promise.all([
    db.transaction.findMany({ where: { month }, include: { category: true, toAccount: true } }),
    db.transaction.groupBy({ by: ["month", "categoryId"], where: { type: "EXPENSE", month: { in: window3 }, categoryId: { not: null } }, _sum: { amountCents: true } }),
    db.transaction.groupBy({
      by: ["month"],
      where: { type: "EXPENSE", month: { in: window12 }, projectId: null, category: { countsInCostOfLiving: true } },
      _sum: { amountCents: true },
    }),
    db.category.findMany(),
    db.project.findMany(),
    listAccounts(),
    listInvoices(),
    db.transaction.aggregate({ where: { reimbursementStatus: "PENDING" }, _sum: { amountCents: true }, _count: true }),
    db.assetSnapshot.findMany({ select: { month: true, assetClass: true, valueCents: true } }),
  ]);

  const dashTxs: DashTx[] = txs.map((t) => ({
    type: t.type,
    month: t.month,
    amountCents: t.amountCents,
    categoryId: t.categoryId,
    countsInCostOfLiving: t.category?.countsInCostOfLiving ?? false,
    projectId: t.projectId,
    isTransferToInvestment: t.type === "TRANSFER" && (t.toAccount?.type === "SAVINGS" || t.toAccount?.type === "INVESTMENT"),
  }));
  const summary = summarizeMonth({
    month,
    txs: dashTxs,
    history: history.map((h) => ({ month: h.month, categoryId: h.categoryId!, cents: h._sum.amountCents ?? 0 })),
  });

  // Hoje: saldo em conta, faturas e sobra prevista do mês corrente.
  const now = today();
  const nowMonthEnd = monthEnd(currentMonthKey());
  const checkingCents = accounts.filter((a) => a.type === "CHECKING").reduce((s, a) => s + a.balanceCents, 0);
  const unpaid = invoices.filter((i) => i.status !== "PAID").sort((a, b) => a.month.localeCompare(b.month));
  const openInvoice = unpaid.find((i) => i.closingDate.getTime() >= now.getTime()) ?? null;
  const dueByEndOfMonth = unpaid.filter((i) => i.dueDate.getTime() <= nowMonthEnd.getTime() && i.totalCents > 0);
  const dueCents = dueByEndOfMonth.reduce((s, i) => s + i.totalCents, 0);

  const patrimony = latestPatrimony(snapshots);
  const colMonths = colRows.filter((r) => (r._sum.amountCents ?? 0) > 0);
  const avgCostOfLiving = colMonths.length ? Math.round(colMonths.reduce((s, r) => s + (r._sum.amountCents ?? 0), 0) / colMonths.length) : 0;

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  return {
    month,
    summary: {
      ...summary,
      byCategory: summary.byCategory.map((c) => ({ ...c, name: catName.get(c.categoryId) ?? "—" })),
      byProject: summary.byProject.map((p) => ({ ...p, name: projName.get(p.projectId) ?? "—" })),
    },
    checkingCents,
    dueCents,
    dueCount: dueByEndOfMonth.length,
    nowMonthEnd,
    sobraPrevistaCents: checkingCents - dueCents,
    openInvoice: openInvoice ? { totalCents: openInvoice.totalCents, dueDate: openInvoice.dueDate, accountName: openInvoice.accountName } : null,
    pendingReimbursementCents: pendingReimb._sum.amountCents ?? 0,
    pendingReimbursementCount: pendingReimb._count,
    patrimony,
    avgCostOfLivingCents: avgCostOfLiving,
    coverageYears: patrimony ? coverageYears(patrimony.cents, avgCostOfLiving) : null,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

// Resumo do mês para o painel (regras puras).
import { addMonthKey } from "@/lib/months";

export interface DashTx {
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  month: string;
  amountCents: number;
  categoryId: string | null;
  countsInCostOfLiving: boolean;
  projectId: string | null;
  isTransferToInvestment: boolean;
  /** Conta de benefício (Ticket): a receita não é dinheiro em conta. */
  isBenefit: boolean;
}

export interface CategorySummary {
  categoryId: string;
  cents: number;
  avg3Cents: number;
  /** (mês − média dos 3 anteriores) / média; null sem histórico. */
  overPct: number | null;
}

export interface MonthSummary {
  incomeCents: number;
  /** Receitas em contas de benefício (Ticket), fora de incomeCents. */
  benefitsCents: number;
  expenseCents: number;
  investedCents: number;
  byCategory: CategorySummary[];
  byProject: { projectId: string; cents: number }[];
  costOfLivingCents: number;
}

/** Alerta de categoria acima do normal: estritamente mais de 20% acima da média. */
export const OVER_THRESHOLD = 0.2;

/** Gasto que entra no custo de vida: despesa fora de projeto em categoria marcada. */
export const isCostOfLiving = (t: Pick<DashTx, "type" | "countsInCostOfLiving" | "projectId">) => t.type === "EXPENSE" && t.countsInCostOfLiving && !t.projectId;

export function summarizeMonth(input: { month: string; txs: DashTx[]; history: { month: string; categoryId: string; cents: number }[] }): MonthSummary {
  let incomeCents = 0;
  let benefitsCents = 0;
  let expenseCents = 0;
  let investedCents = 0;
  let costOfLivingCents = 0;
  const byCat = new Map<string, number>();
  const byProject = new Map<string, number>();

  for (const t of input.txs) {
    if (t.type === "INCOME") {
      if (t.isBenefit) benefitsCents += t.amountCents;
      else incomeCents += t.amountCents;
    }
    else if (t.type === "TRANSFER") {
      if (t.isTransferToInvestment) investedCents += t.amountCents;
    } else {
      expenseCents += t.amountCents;
      if (t.categoryId) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amountCents);
      if (t.projectId) byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + t.amountCents);
      if (isCostOfLiving(t)) costOfLivingCents += t.amountCents;
    }
  }

  const window = [1, 2, 3].map((n) => addMonthKey(input.month, -n));
  const hasHistory = input.history.some((h) => window.includes(h.month));
  const byCategory = [...byCat.entries()]
    .map(([categoryId, cents]) => {
      const sum = input.history.filter((h) => h.categoryId === categoryId && window.includes(h.month)).reduce((s, h) => s + h.cents, 0);
      const avg3Cents = Math.round(sum / 3);
      return { categoryId, cents, avg3Cents, overPct: hasHistory && avg3Cents > 0 ? (cents - avg3Cents) / avg3Cents : null };
    })
    .sort((a, b) => b.cents - a.cents);

  return {
    incomeCents,
    benefitsCents,
    expenseCents,
    investedCents,
    byCategory,
    byProject: [...byProject.entries()].map(([projectId, cents]) => ({ projectId, cents })).sort((a, b) => b.cents - a.cents),
    costOfLivingCents,
  };
}

/** Por quantos anos o patrimônio cobre o custo de vida mensal (sem rendimento). */
export function coverageYears(patrimonyCents: number, monthlyCostCents: number): number | null {
  if (monthlyCostCents <= 0) return null;
  return patrimonyCents / (monthlyCostCents * 12);
}

/**
 * Patrimônio atual: o valor mais recente de cada classe de ativo (classes que não
 * foram atualizadas no último mês entram com o último valor conhecido).
 */
export function latestPatrimony(snapshots: { month: string; assetClass: string; valueCents: number }[]): { month: string; cents: number } | null {
  if (snapshots.length === 0) return null;
  const latest = new Map<string, { month: string; valueCents: number }>();
  for (const s of snapshots) {
    const cur = latest.get(s.assetClass);
    if (!cur || s.month > cur.month) latest.set(s.assetClass, s);
  }
  const values = [...latest.values()];
  return { month: values.map((v) => v.month).sort().at(-1)!, cents: values.reduce((sum, v) => sum + v.valueCents, 0) };
}

/** Recorrente prevista, vista pela conta corrente. */
export interface PendingFlow {
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  amountCents: number;
  /** A conta da recorrente é uma conta corrente. */
  fromChecking: boolean;
  /** Transferência que chega numa conta corrente. */
  toChecking: boolean;
}

/**
 * Sobra prevista até o fim do mês: saldo em conta corrente − faturas a vencer −
 * contas recorrentes previstas que saem da conta + receitas previstas que entram nela.
 */
export function plannedLeftover(input: { checkingCents: number; invoicesDueCents: number; pending: PendingFlow[] }) {
  let out = 0;
  let inflow = 0;
  for (const p of input.pending) {
    if (p.type === "INCOME" && p.fromChecking) inflow += p.amountCents;
    else if (p.type !== "INCOME" && p.fromChecking && !(p.type === "TRANSFER" && p.toChecking)) out += p.amountCents;
    else if (p.type === "TRANSFER" && p.toChecking && !p.fromChecking) inflow += p.amountCents;
  }
  return { leftoverCents: input.checkingCents - input.invoicesDueCents - out + inflow, upcomingOutCents: out, upcomingInCents: inflow };
}

// Mapeamento puro: linhas lidas da Zak26 → lançamentos a criar.
import { invoiceDates } from "@/domain/invoices";
import { normalizeDescription } from "@/domain/suggest";
import { monthLabel, monthStart } from "@/lib/months";
import type { BlockId } from "./layout";
import type { ZakParse, ZakRow } from "./parse";

export interface PlanContext {
  accounts: { checking: string; card: string; savings: string; broker: string; ticket: string };
  card: { closingDay: number; dueDay: number };
  /** Id da categoria pelo tipo e nome (ex.: ("EXPENSE", "Mercado")). */
  categories: (kind: "EXPENSE" | "INCOME", name: string) => string;
  projects: { Sótão: string; Agro: string };
  currentMonth: string;
}

export interface PlannedTx {
  importKey: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  date: Date;
  month: string;
  description: string;
  amountCents: number;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  projectId: string | null;
  /** Mês da fatura (compras no cartão). */
  invoiceMonth: string | null;
  /** Transferência que paga a fatura deste mês. */
  paysInvoiceMonth: string | null;
  reimbursable: boolean;
  reimbursementStatus: "PENDING" | "SETTLED" | null;
}

const EXPENSE_CATEGORY: Partial<Record<BlockId, string>> = {
  MERCADO_CREDITO: "Mercado",
  MERCADO_DEBITO: "Mercado",
  DESPESAS_CREDITO: "Despesas",
  DESPESAS_DEBITO: "Despesas",
  SAUDE_CREDITO: "Saúde",
  SAUDE_DEBITO: "Saúde",
  CARRO_CREDITO: "Carro",
  CARRO_DEBITO: "Carro",
  REEMBOLSAVEL_CREDITO: "Reembolsável",
  REEMBOLSAVEL_DEBITO: "Reembolsável",
  AGRO_CREDITO: "Projetos",
  AGRO_DEBITO: "Projetos",
  SOTAO_CREDITO: "Projetos",
  SOTAO_DEBITO: "Projetos",
};

const INCOME_CATEGORY: Partial<Record<BlockId, string>> = {
  DIVIDENDOS: "Dividendos",
  REEMBOLSO_RECEBIDO: "Reembolso",
  QUILOMETRAGEM: "Quilometragem",
  ROVE: "Rove",
};

/** Categoria de receita do bloco "Receitas" pela descrição. */
export function incomeCategoryFor(description: string): string {
  const d = normalizeDescription(description).replace(/:$/, "");
  if (d.startsWith("sma") || d.startsWith("salario")) return "Salário";
  if (d.startsWith("felipe") || d.startsWith("dani")) return "Aluguel/Ajuda";
  if (d.startsWith("adiantamento")) return "Adiantamento";
  return "Outros";
}

function rowToTx(row: ZakRow, ctx: PlanContext): PlannedTx {
  const base = {
    importKey: row.importKey,
    date: row.date,
    month: row.month,
    description: row.description.replace(/:$/, ""),
    amountCents: row.cents,
    toAccountId: null,
    projectId: null,
    invoiceMonth: null,
    paysInvoiceMonth: null,
    reimbursable: false,
    reimbursementStatus: null,
  };
  const expense = EXPENSE_CATEGORY[row.block];
  if (expense && row.cents < 0) {
    // Estorno/cashback: receita na mesma conta (e na mesma fatura, se for cartão).
    const isCard = row.payment === "CREDITO";
    return {
      ...base,
      type: "INCOME",
      amountCents: -row.cents,
      accountId: isCard ? ctx.accounts.card : ctx.accounts.checking,
      categoryId: ctx.categories("INCOME", "Estorno"),
      projectId: row.block.startsWith("AGRO") ? ctx.projects.Agro : row.block.startsWith("SOTAO") ? ctx.projects.Sótão : null,
      invoiceMonth: isCard ? row.month : null,
    };
  }
  if (expense) {
    const isCard = row.payment === "CREDITO";
    const reimbursable = expense === "Reembolsável";
    return {
      ...base,
      type: "EXPENSE",
      accountId: isCard ? ctx.accounts.card : ctx.accounts.checking,
      categoryId: ctx.categories("EXPENSE", expense),
      projectId: row.block.startsWith("AGRO") ? ctx.projects.Agro : row.block.startsWith("SOTAO") ? ctx.projects.Sótão : null,
      invoiceMonth: isCard ? row.month : null,
      reimbursable,
      reimbursementStatus: reimbursable ? (row.month < ctx.currentMonth ? "SETTLED" : "PENDING") : null,
    };
  }
  if (row.block === "INVESTIMENTO") {
    const toSavings = normalizeDescription(row.description).startsWith("poupanca");
    return { ...base, type: "TRANSFER", accountId: ctx.accounts.checking, toAccountId: toSavings ? ctx.accounts.savings : ctx.accounts.broker, categoryId: null };
  }
  const income = INCOME_CATEGORY[row.block] ?? incomeCategoryFor(row.description);
  return { ...base, type: "INCOME", accountId: ctx.accounts.checking, categoryId: ctx.categories("INCOME", income) };
}

export function planZakImport(parse: ZakParse, ctx: PlanContext): PlannedTx[] {
  const out = parse.rows.map((r) => rowToTx(r, ctx));

  for (const t of parse.ticket) {
    const date = monthStart(t.month);
    const col = String.fromCharCode(65 + Number(t.month.slice(5)));
    const common = { date, month: t.month, amountCents: t.cents, accountId: ctx.accounts.ticket, toAccountId: null, projectId: null, invoiceMonth: null, paysInvoiceMonth: null, reimbursable: false, reimbursementStatus: null };
    out.push({ ...common, importKey: `ZAK26:Geral:${col}7:in`, type: "INCOME", description: "Ticket", categoryId: ctx.categories("INCOME", "Ticket") });
    out.push({ ...common, importKey: `ZAK26:Geral:${col}7:out`, type: "EXPENSE", description: "Ticket (consumo)", categoryId: ctx.categories("EXPENSE", "Mercado") });
  }

  // Faturas de meses passados: uma transferência da conta para o cartão no vencimento.
  const creditByMonth = new Map<string, number>();
  for (const t of out) {
    if (!t.invoiceMonth) continue;
    const signed = t.type === "INCOME" ? -t.amountCents : t.amountCents;
    creditByMonth.set(t.invoiceMonth, (creditByMonth.get(t.invoiceMonth) ?? 0) + signed);
  }
  for (const [month, total] of [...creditByMonth.entries()].sort()) {
    if (month >= ctx.currentMonth || total <= 0) continue;
    const { dueDate } = invoiceDates(month, ctx.card.closingDay, ctx.card.dueDay);
    out.push({
      importKey: `ZAK26:fatura:${month}`,
      type: "TRANSFER",
      date: dueDate,
      month,
      description: `Pagamento fatura ${monthLabel(month)}`,
      amountCents: total,
      accountId: ctx.accounts.checking,
      toAccountId: ctx.accounts.card,
      categoryId: null,
      projectId: null,
      invoiceMonth: null,
      paysInvoiceMonth: month,
      reimbursable: false,
      reimbursementStatus: null,
    });
  }
  return out;
}

/** Saldo da conta corrente no fim de cada mês (pelo mês de caixa), para conferir com a Geral. */
export function simulateChecking(plan: PlannedTx[], openingCents: number, checkingId: string): Map<string, number> {
  const delta = new Map<string, number>();
  for (const t of plan) {
    let v = 0;
    if (t.accountId === checkingId) v = t.type === "INCOME" ? t.amountCents : -t.amountCents;
    else if (t.toAccountId === checkingId) v = t.amountCents;
    if (v) delta.set(t.month, (delta.get(t.month) ?? 0) + v);
  }
  const out = new Map<string, number>();
  let balance = openingCents;
  for (const month of [...delta.keys()].sort()) {
    balance += delta.get(month)!;
    out.set(month, balance);
  }
  return out;
}

/** Saldo no fim do mês: o último saldo simulado até aquele mês (ou o inicial). */
export function balanceAt(simulated: Map<string, number>, month: string, openingCents: number): number {
  let balance = openingCents;
  for (const m of [...simulated.keys()].sort()) {
    if (m > month) break;
    balance = simulated.get(m)!;
  }
  return balance;
}

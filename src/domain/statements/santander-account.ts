// Leitor do "Extrato Consolidado Inteligente" (conta corrente Santander, PDF).
//
// Na movimentação, cada lançamento termina numa linha com
//   [nº do documento ou "-"] VALOR[-] [SALDO[-]]
// O "-" depois do valor indica débito. A descrição é o texto acumulado desde o
// lançamento anterior. Linhas que começam com dd/mm trocam a data corrente.
import { brlToCents, linesOf, MONEY, MONTH_NAMES, utcDate, type StatementIssue } from "./common";

export interface AccountLine {
  date: Date;
  description: string;
  /** Positivo = crédito, negativo = débito. */
  amountCents: number;
  /** Saldo do dia informado no extrato, quando vem na mesma linha. */
  balanceCents: number | null;
}

export interface AccountStatement {
  month: string;
  lines: AccountLine[];
  openingCents: number;
  closingCents: number;
  savingsCents: number | null;
  fundCents: number | null;
  /** Número da poupança (ex.: "016861-9"), para reconhecer transferências para ela. */
  savingsAccount: string | null;
  issues: StatementIssue[];
}

const AMOUNT_LINE = new RegExp(String.raw`^(.*?)\s*(?:(?:^|\s)(-|\d{4,}))?\s*(${MONEY})(-?)(?:\s+(${MONEY})(-?))?$`);
const NOISE = /^(EXTRATO CONSOLIDADO|E xtrato_|B ALP_|P agina:|[a-zç]+\/\d{4}$)/i;

export function parseSantanderAccount(text: string): AccountStatement {
  const lines = linesOf(text);
  const header = lines.find((l) => /^[a-zç]+\/\d{4}$/i.test(l));
  const [monthName, yearText] = (header ?? "/").split("/");
  const monthIndex = MONTH_NAMES.indexOf(monthName.toLowerCase());
  const year = Number(yearText);
  const month = monthIndex >= 0 ? `${year}-${String(monthIndex + 1).padStart(2, "0")}` : "";

  const start = lines.indexOf("Movimentação");
  const endRel = lines.slice(start + 1).findIndex((l) => /^Se você não tem Limite|^Saldos por Período/.test(l));
  const body = start >= 0 ? lines.slice(start + 1, endRel >= 0 ? start + 1 + endRel : undefined) : [];

  const out: AccountLine[] = [];
  const issues: StatementIssue[] = [];
  let date: Date | null = null;
  let pending: string[] = [];

  for (const raw of body) {
    if (NOISE.test(raw)) continue;
    let line = raw;
    const dm = /^(\d{2})\/(\d{2})\s+(.*)$/.exec(line);
    if (dm) {
      date = utcDate(year, Number(dm[2]), Number(dm[1]));
      line = dm[3];
    }
    const am = AMOUNT_LINE.exec(line);
    if (!am || !date) {
      pending.push(line);
      continue;
    }
    const [, before, , amount, minus, balance, balanceMinus] = am;
    const description = [...pending, before].join(" ").replace(/\s+/g, " ").trim();
    pending = [];
    out.push({
      date,
      description,
      amountCents: brlToCents(amount) * (minus ? -1 : 1),
      balanceCents: balance ? brlToCents(balance) * (balanceMinus ? -1 : 1) : null,
    });
  }

  // Saldo inicial: primeiro saldo informado menos os lançamentos até ele.
  const firstWithBalance = out.findIndex((l) => l.balanceCents !== null);
  let openingCents = 0;
  if (firstWithBalance >= 0) {
    const moved = out.slice(0, firstWithBalance + 1).reduce((s, l) => s + l.amountCents, 0);
    openingCents = out[firstWithBalance].balanceCents! - moved;
  }
  let running = openingCents;
  for (const l of out) {
    running += l.amountCents;
    if (l.balanceCents !== null && l.balanceCents !== running) {
      issues.push({ message: `Saldo de ${l.date.toISOString().slice(0, 10)} no extrato (${l.balanceCents / 100}) diferente da soma dos lançamentos (${running / 100}).` });
      running = l.balanceCents;
    }
  }

  const savingsLine = lines.find((l) => /^POUPANCA\b/i.test(l) && new RegExp(`${MONEY}$`).test(l));
  const fundLine = lines.find((l) => /^DI\b.*\bVIP\b|FUNDO/i.test(l) && new RegExp(`${MONEY}$`).test(l));
  const lastMoney = (l?: string) => (l ? brlToCents(new RegExp(`(${MONEY})$`).exec(l)![1]) : null);
  const savingsIdx = lines.findIndex((l) => /^Poupança$/i.test(l));
  const savingsAccount = savingsIdx >= 0 ? (/(\d{6}-\d)\s*$/.exec(lines[savingsIdx + 1] ?? "")?.[1] ?? null) : null;

  if (!month) issues.push({ message: "Mês do extrato não encontrado." });
  if (out.length === 0) issues.push({ message: "Nenhum lançamento encontrado no extrato." });

  return { month, lines: out, openingCents, closingCents: running, savingsCents: lastMoney(savingsLine), fundCents: lastMoney(fundLine), savingsAccount, issues };
}

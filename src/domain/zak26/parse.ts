// Leitura pura da planilha Zak26 → estrutura com lançamentos, saldos, patrimônio,
// carteira e problemas encontrados. Não toca no banco.
import { toCents } from "@/lib/money";
import { monthKey, moveToMonth } from "@/lib/months";
import { isNumber, label, ref, text, toMatrix, type Cell, type Grid } from "./grid";
import { DATE_MAX, DATE_MIN, IGNORED_COLS, MONTH_SHEETS, matchHeader, paymentOf, type BlockId } from "./layout";

export interface ZakRow {
  importKey: string;
  sheet: string;
  row: number;
  month: string;
  block: BlockId;
  description: string;
  cents: number;
  date: Date;
  dateIssue: boolean;
  payment: "CREDITO" | "DEBITO" | null;
}

export type ZakIssueKind = "DATA_INVALIDA" | "VALOR_INVALIDO" | "SEM_DESCRICAO" | "ESTORNO" | "BLOCO_IGNORADO" | "TOTAL_DIVERGENTE" | "DATA_FORA_DO_MES";

export interface ZakIssue {
  sheet: string;
  cell: string;
  kind: ZakIssueKind;
  message: string;
}

export interface ZakHolding {
  ticker: string;
  kind: "ACAO" | "FII" | "ETF";
  quantity: number;
  avgPriceCents: number;
  dividendsTotalCents: number;
}

export interface ZakParse {
  rows: ZakRow[];
  ticket: { month: string; cents: number }[];
  checkingOpeningCents: number;
  geralBalances: { month: string; cents: number }[];
  snapshots: { month: string; assetClass: string; cents: number }[];
  holdings: ZakHolding[];
  blockTotals: { month: string; block: BlockId; sheetCents: number; parsedCents: number }[];
  issues: ZakIssue[];
  rawInv: Cell[][];
  rawGeral: Cell[][];
}

const monthOf = (year: number, index: number) => `${year}-${String(index + 1).padStart(2, "0")}`;

/** Data válida da célula (Date ou número de série do Excel), como meia-noite UTC. */
export function cellDate(c: Cell): Date | null {
  let date: Date | null = null;
  if (c instanceof Date && !Number.isNaN(c.getTime())) {
    // Arredonda para o dia mais próximo (séries com fração de hora).
    date = new Date(Math.round(c.getTime() / 86_400_000) * 86_400_000);
  } else if (isNumber(c) && c > 30000 && c < 80000) {
    date = new Date(Math.round((c - 25569) * 86_400_000));
  }
  if (!date) return null;
  const t = date.getTime();
  return t >= DATE_MIN && t <= DATE_MAX ? date : null;
}

function parseMonthSheet(grid: Grid, month: string, out: ZakParse) {
  let block: BlockId | null = null;
  let sum = 0;
  const firstOfMonth = new Date(`${month}-01T00:00:00.000Z`);

  for (let r = 1; r <= grid.rowCount; r++) {
    const a = grid.get(r, 1);
    const b = grid.get(r, 2);
    const c = grid.get(r, 3);

    if (text(b) === "Total:") {
      if (block) {
        const sheetCents = isNumber(c) ? toCents(c) : 0;
        out.blockTotals.push({ month, block, sheetCents, parsedCents: sum });
        if (Math.abs(sheetCents - sum) > 1) {
          out.issues.push({
            sheet: grid.name,
            cell: ref(r, 3),
            kind: "TOTAL_DIVERGENTE",
            message: `Total da planilha ${(sheetCents / 100).toFixed(2)} difere da soma dos itens ${(sum / 100).toFixed(2)}.`,
          });
        }
      }
      block = null;
      continue;
    }

    if (!isNumber(b)) {
      const header = matchHeader(label(a));
      if (header) {
        block = header;
        sum = 0;
      } else if (block && b !== null && (typeof b === "object" || !["Valor", "Custo", ""].includes(text(b)))) {
        // Valor que não é número (texto ou erro): não importado, mas avisado.
        out.issues.push({ sheet: grid.name, cell: ref(r, 2), kind: "VALOR_INVALIDO", message: `Valor não numérico ("${typeof b === "object" && b && "error" in b ? b.error : text(b)}"); linha não importada.` });
      }
      continue;
    }

    if (!block || b === 0) continue;
    const cents = toCents(b);
    const payment = paymentOf(block);
    let date = cellDate(c);
    const dateIssue = !date;
    if (!date) {
      date = firstOfMonth;
      out.issues.push({ sheet: grid.name, cell: ref(r, 3), kind: "DATA_INVALIDA", message: `Data inválida ou vazia; usado o dia 1º do mês.` });
    } else if (payment !== "CREDITO" && monthKey(date) !== month) {
      // Data digitada no mês errado (ex.: 05/09 na aba de outubro): mantém o dia e usa o mês da aba.
      const fixed = moveToMonth(date, month);
      const br = (x: Date) => x.toISOString().slice(0, 10).split("-").reverse().join("/");
      out.issues.push({ sheet: grid.name, cell: ref(r, 3), kind: "DATA_FORA_DO_MES", message: `Data ${br(date)} fora do mês da aba; corrigida para ${br(fixed)}.` });
      date = fixed;
    }
    const description = text(a) || "(sem descrição)";
    if (!text(a)) out.issues.push({ sheet: grid.name, cell: ref(r, 1), kind: "SEM_DESCRICAO", message: "Valor sem descrição." });
    if (cents < 0) out.issues.push({ sheet: grid.name, cell: ref(r, 2), kind: "ESTORNO", message: "Valor negativo: importado como estorno (receita na mesma conta/fatura)." });
    sum += cents;
    out.rows.push({ importKey: `ZAK26:${grid.name}:${ref(r, 2)}`, sheet: grid.name, row: r, month, block, description, cents, date, dateIssue, payment });
  }

  for (let r = 1; r <= grid.rowCount; r++) {
    let found = false;
    for (let col = IGNORED_COLS.from; col <= IGNORED_COLS.to && !found; col++) found = grid.get(r, col) !== null;
    if (found) {
      out.issues.push({ sheet: grid.name, cell: `P${r}`, kind: "BLOCO_IGNORADO", message: "Bloco \"Outros\" (colunas P–R) ignorado: repete lançamentos de 2025." });
      break;
    }
  }
}

const ASSET_ROWS: [RegExp, string][] = [
  [/^poupan/, "Poupança"],
  [/^fundos/, "Fundos"],
  [/^a.{0,3}es:?$/, "Ações"],
  [/^fiis/, "FIIs"],
  [/^etf/, "ETF"],
  [/^previd/, "Previdência"],
];

function parseGeral(grid: Grid, year: number, lastMonth: string, out: ZakParse) {
  const monthCols = (r: number, fn: (month: string, value: number) => void) => {
    for (let i = 0; i < 12; i++) {
      const month = monthOf(year, i);
      const v = grid.get(r, i + 2);
      if (month <= lastMonth && isNumber(v)) fn(month, v);
    }
  };
  for (let r = 1; r <= grid.rowCount; r++) {
    const name = label(grid.get(r, 1));
    if (!name) continue;
    if (name.startsWith("tickets")) monthCols(r, (month, v) => out.ticket.push({ month, cents: toCents(v) }));
    else if (name.startsWith("saldo anterior")) {
      const v = grid.get(r, 2);
      if (isNumber(v)) out.checkingOpeningCents = toCents(v);
    } else if (name.startsWith("saldo cc")) monthCols(r, (month, v) => out.geralBalances.push({ month, cents: toCents(v) }));
    else {
      const asset = ASSET_ROWS.find(([re]) => re.test(name))?.[1];
      if (asset) monthCols(r, (month, v) => out.snapshots.push({ month, assetClass: asset, cents: toCents(v) }));
    }
  }
  out.rawGeral = toMatrix(grid, 40, 14);
}

const TICKER = /^[A-Z]{4}\d{1,2}$/;

function parseInv(grid: Grid, out: ZakParse) {
  let totalAcoesRow = Infinity;
  let totalFiiRow = Infinity;
  for (let r = 1; r <= grid.rowCount; r++) {
    const d = label(grid.get(r, 4));
    if (/^total a/.test(d) && totalAcoesRow === Infinity) totalAcoesRow = r;
    if (/^total fii/.test(d) && totalFiiRow === Infinity) totalFiiRow = r;
  }
  for (let r = 1; r <= grid.rowCount; r++) {
    const ticker = text(grid.get(r, 1));
    const qty = grid.get(r, 2);
    const avg = grid.get(r, 3);
    if (!TICKER.test(ticker) || !isNumber(qty) || qty <= 0 || !isNumber(avg)) continue;
    if (out.holdings.some((h) => h.ticker === ticker)) continue; // tabela de apoio repete os tickers
    const div = grid.get(r, 11);
    out.holdings.push({
      ticker,
      kind: r < totalAcoesRow ? "ACAO" : r < totalFiiRow ? "FII" : "ETF",
      quantity: Math.round(qty),
      avgPriceCents: toCents(avg),
      dividendsTotalCents: isNumber(div) ? toCents(div) : 0,
    });
  }
  out.rawInv = toMatrix(grid, 60, 23);
}

export function parseZak26(sheets: Grid[], opts: { year: number; lastMonth: string }): ZakParse {
  const out: ZakParse = {
    rows: [],
    ticket: [],
    checkingOpeningCents: 0,
    geralBalances: [],
    snapshots: [],
    holdings: [],
    blockTotals: [],
    issues: [],
    rawInv: [],
    rawGeral: [],
  };
  for (const [i, name] of MONTH_SHEETS.entries()) {
    const grid = sheets.find((s) => s.name === name);
    const month = monthOf(opts.year, i);
    if (grid && month <= opts.lastMonth) parseMonthSheet(grid, month, out);
  }
  const geral = sheets.find((s) => s.name === "Geral");
  if (geral) parseGeral(geral, opts.year, opts.lastMonth, out);
  const inv = sheets.find((s) => s.name === "Inv");
  if (inv) parseInv(inv, out);
  return out;
}

import { describe, expect, test } from "vitest";
import { parseZak26 } from "@/domain/zak26/parse";
import { geral, inv, monthSheet, OUT } from "./fixtures/zak26-grid";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const parse = (sheets = [OUT, geral, inv], lastMonth = "2026-11") => parseZak26(sheets, { year: 2026, lastMonth });

describe("month sheets", () => {
  const result = parse();
  const byKey = (k: string) => result.rows.find((r) => r.importKey === k)!;

  test("credit row keeps its purchase date and the sheet month", () => {
    expect(byKey("ZAK26:Out:B53")).toMatchObject({
      month: "2026-10",
      block: "MERCADO_CREDITO",
      payment: "CREDITO",
      description: "vitorino",
      cents: 53853,
      date: d("2026-09-16"),
      dateIssue: false,
    });
  });

  test("missing date falls back to the 1st of the sheet month with an issue", () => {
    expect(byKey("ZAK26:Out:B54")).toMatchObject({ date: d("2026-10-01"), dateIssue: true });
    expect(result.issues).toContainEqual(expect.objectContaining({ sheet: "Out", cell: "C54", kind: "DATA_INVALIDA" }));
  });

  test("text date like 28/02/0202 is invalid", () => {
    expect(byKey("ZAK26:Out:B55").dateIssue).toBe(true);
    expect(result.issues).toContainEqual(expect.objectContaining({ cell: "C55", kind: "DATA_INVALIDA" }));
  });

  test("income, dividends, investment, debit, reimbursable and project blocks", () => {
    expect(byKey("ZAK26:Out:B3")).toMatchObject({ block: "RECEITAS", payment: null, description: "SMA:", cents: 481842 });
    expect(byKey("ZAK26:Out:B13").block).toBe("DIVIDENDOS");
    expect(byKey("ZAK26:Out:B43").block).toBe("INVESTIMENTO");
    expect(byKey("ZAK26:Out:B98")).toMatchObject({ block: "MERCADO_DEBITO", payment: "DEBITO" });
    expect(byKey("ZAK26:Out:B223")).toMatchObject({ block: "REEMBOLSAVEL_DEBITO", payment: "DEBITO" });
    expect(byKey("ZAK26:Out:B316")).toMatchObject({ block: "SOTAO_CREDITO", payment: "CREDITO" });
  });

  test("labels without a value are not items", () => {
    expect(result.rows.find((r) => r.description === "Item")).toBeUndefined();
  });

  test("columns P–R are ignored and reported once", () => {
    expect(result.rows.find((r) => r.description === "gisele")).toBeUndefined();
    expect(result.issues.filter((i) => i.kind === "BLOCO_IGNORADO" && i.sheet === "Out")).toHaveLength(1);
  });

  test("block total different from the parsed items is reported", () => {
    // Mercado Crédito: itens somam 538,53 + 265,92 + 10 = 814,45; a planilha diz 900.
    expect(result.blockTotals).toContainEqual({ month: "2026-10", block: "MERCADO_CREDITO", sheetCents: 90000, parsedCents: 81445 });
    expect(result.issues).toContainEqual(expect.objectContaining({ cell: "C96", kind: "TOTAL_DIVERGENTE" }));
    expect(result.issues.find((i) => i.cell === "C109")).toBeUndefined();
  });

  test("debit row dated outside the sheet month is flagged but kept", () => {
    const sheet = monthSheet("Out", { A98: "agua", B98: 429.05, C98: d("2026-09-05") }, { 109: 429.05 });
    const r = parseZak26([sheet], { year: 2026, lastMonth: "2026-11" });
    expect(r.rows[0].date).toEqual(d("2026-09-05"));
    expect(r.issues).toContainEqual(expect.objectContaining({ cell: "C98", kind: "DATA_FORA_DO_MES" }));
  });

  test("sheets after lastMonth are skipped", () => {
    const dez = monthSheet("Dez", { A98: "celesc", B98: 100, C98: d("2026-12-20") }, { 109: 100 });
    expect(parseZak26([dez], { year: 2026, lastMonth: "2026-11" }).rows).toHaveLength(0);
  });
});

describe("Geral and Inv", () => {
  const result = parse();

  test("opening balance, Geral balances and tickets", () => {
    expect(result.checkingOpeningCents).toBe(650263);
    expect(result.geralBalances).toContainEqual({ month: "2026-10", cents: 878243 });
    expect(result.ticket).toEqual([
      { month: "2026-01", cents: 91300 },
      { month: "2026-02", cents: 95400 },
      { month: "2026-10", cents: 95400 },
      { month: "2026-11", cents: 95400 },
    ]);
  });

  test("asset snapshots", () => {
    expect(result.snapshots).toContainEqual({ month: "2026-10", assetClass: "Previdência", cents: 32980375 });
    expect(result.snapshots).toContainEqual({ month: "2026-10", assetClass: "ETF", cents: 653100 });
    expect(result.snapshots).toContainEqual({ month: "2026-10", assetClass: "Ações", cents: 6395403 });
  });

  test("holdings with kind by section", () => {
    expect(result.holdings).toContainEqual({ ticker: "BBAS3", kind: "ACAO", quantity: 1324, avgPriceCents: 2400, dividendsTotalCents: 217451 });
    expect(result.holdings.find((h) => h.ticker === "KNCR11")?.kind).toBe("FII");
    expect(result.holdings.find((h) => h.ticker === "IVVB11")?.kind).toBe("ETF");
    expect(result.holdings.find((h) => h.ticker === "IBOV")).toBeUndefined();
    expect(result.holdings).toHaveLength(5);
  });

  test("raw Inv grid is kept", () => {
    expect(result.rawInv[9][0]).toBe("BBAS3");
  });
});

describe("review fixes", () => {
  test("non-numeric amount inside a block is reported", () => {
    const sheet = monthSheet("Out", { A98: "celesc", B98: "50,00", C98: d("2026-10-20"), A99: "agua", B99: { error: "#VALUE!" }, C99: d("2026-10-20") });
    const r = parseZak26([sheet], { year: 2026, lastMonth: "2026-11" });
    expect(r.issues.filter((i) => i.kind === "VALOR_INVALIDO").map((i) => i.cell)).toEqual(["B98", "B99"]);
  });

  test("value without description has its own kind", () => {
    const sheet = monthSheet("Out", { B98: 10, C98: d("2026-10-20") }, { 109: 10 });
    const r = parseZak26([sheet], { year: 2026, lastMonth: "2026-11" });
    expect(r.issues).toContainEqual(expect.objectContaining({ cell: "A98", kind: "SEM_DESCRICAO" }));
  });

  test("negative amount is kept and flagged as a refund", () => {
    const sheet = monthSheet("Mai", { A126: "cashback esfera", B126: -420, C126: d("2026-04-20") }, { 139: -420 });
    const r = parseZak26([sheet], { year: 2026, lastMonth: "2026-11" });
    expect(r.rows[0].cents).toBe(-42000);
    expect(r.issues).toContainEqual(expect.objectContaining({ cell: "B126", kind: "ESTORNO" }));
  });
});

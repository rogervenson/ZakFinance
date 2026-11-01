import { beforeEach, describe, expect, test } from "vitest";
import { db } from "@/server/db";
import { getPortfolio, recordDividend, recordOperation, saveSnapshotMonth, listSnapshots, deleteOperation } from "@/server/services/investments";
import { refreshQuotes } from "@/server/services/quotes";
import { ids, wipeTransactions } from "./helpers";

let I: Awaited<ReturnType<typeof ids>>;

beforeEach(async () => {
  await wipeTransactions();
  await db.investmentOperation.deleteMany();
  await db.quote.deleteMany();
  I = await ids();
  await db.holding.create({ data: { ticker: "BBAS3", kind: "ACAO", quantity: 1324, avgPriceCents: 2400, dividendsTotalCents: 217451, asOf: new Date("2026-11-01T00:00:00Z") } });
});

describe("operations", () => {
  test("buying an existing asset updates quantity and average price", async () => {
    await recordOperation({ ticker: "bbas3", type: "BUY", date: "2026-10-31", quantity: "100", price: "17,75", fees: "0" });
    const h = await db.holding.findUniqueOrThrow({ where: { ticker: "BBAS3" } });
    expect(h.quantity).toBe(1424);
    expect(h.avgPriceCents).toBe(Math.round((1324 * 2400 + 100 * 1775) / 1424));
  });

  test("buying a new asset creates the position with the chosen kind", async () => {
    await recordOperation({ ticker: "HGLG11", kind: "FII", type: "BUY", date: "2026-10-31", quantity: "10", price: "160,00" });
    expect(await db.holding.findUniqueOrThrow({ where: { ticker: "HGLG11" } })).toMatchObject({ kind: "FII", quantity: 10, avgPriceCents: 16000 });
  });

  test("selling records the realized gain; deleting the last operation restores the position", async () => {
    const op = await recordOperation({ ticker: "BBAS3", type: "SELL", date: "2026-10-31", quantity: "324", price: "25,00" });
    expect(op.realizedCents).toBe(324 * 100);
    expect(await db.holding.findUniqueOrThrow({ where: { ticker: "BBAS3" } })).toMatchObject({ quantity: 1000, realizedCents: 32400 });
    await deleteOperation(op.id);
    expect(await db.holding.findUniqueOrThrow({ where: { ticker: "BBAS3" } })).toMatchObject({ quantity: 1324, avgPriceCents: 2400, realizedCents: 0 });
  });

  test("selling more than the position is refused", async () => {
    await expect(recordOperation({ ticker: "BBAS3", type: "SELL", date: "2026-10-31", quantity: "2000", price: "25,00" })).rejects.toThrow("só tem 1324");
  });
});

test("a dividend is an income tied to the asset and adds to its dividends", async () => {
  await recordDividend({ ticker: "BBAS3", date: "2026-10-31", amount: "397,10", accountId: I.broker });
  const tx = await db.transaction.findFirstOrThrow({ where: { ticker: "BBAS3" } });
  expect(tx).toMatchObject({ type: "INCOME", amountCents: 39710, categoryId: I.cat("Dividendos", "INCOME"), accountId: I.broker });
  const p = await getPortfolio({ refresh: false });
  expect(p.holdings.find((h) => h.ticker === "BBAS3")!.dividendsCents).toBe(217451 + 39710);
});

test("portfolio uses stored quotes, and refresh fills them through the fetcher", async () => {
  await refreshQuotes({ force: true, fetcher: async (symbol) => (symbol === "BBAS3.SA" ? { priceCents: 1647, changePct: 0.01 } : symbol === "BRL=X" ? { priceCents: 544, changePct: null } : null) });
  const p = await getPortfolio({ refresh: false });
  const b = p.holdings.find((h) => h.ticker === "BBAS3")!;
  expect(b).toMatchObject({ priceCents: 1647, valueCents: 1324 * 1647, quoteMissing: false });
  expect(p.usdCents).toBe(544);
});

test("a failing quote source keeps the last known quote", async () => {
  await refreshQuotes({ force: true, fetcher: async () => ({ priceCents: 1647, changePct: null }) });
  await refreshQuotes({ force: true, fetcher: async () => null });
  expect((await db.quote.findUniqueOrThrow({ where: { ticker: "BBAS3" } })).priceCents).toBe(1647);
});

test("monthly net worth snapshots are saved and listed with totals", async () => {
  await saveSnapshotMonth({ month: "2026-10", values: { Poupança: "1.224,81", Fundos: "12.502,99", Ações: "63.954,03", FIIs: "3.029,90", ETF: "6.531,00", Previdência: "329.803,75" } });
  await saveSnapshotMonth({ month: "2026-10", values: { Poupança: "1.300,00" } });
  const list = await listSnapshots();
  const oct = list.find((m) => m.month === "2026-10")!;
  expect(oct.values["Poupança"]).toBe(130000);
  expect(oct.totalCents).toBe(130000 + 1250299 + 6395403 + 302990 + 653100 + 32980375);
});

test("a month missing some classes carries their latest value into the total", async () => {
  await saveSnapshotMonth({ month: "2026-10", values: { Previdência: "300.000,00", Ações: "60.000,00" } });
  await saveSnapshotMonth({ month: "2026-11", values: { Ações: "65.000,00" } });
  const nov = (await listSnapshots()).find((m) => m.month === "2026-11")!;
  expect(nov.totalCents).toBe(36500000);
  expect(nov.carried).toEqual(["Previdência"]);
});

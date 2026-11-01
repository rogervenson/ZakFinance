import { describe, expect, test } from "vitest";
import { applyBuy, applySell, holdingView, portfolioTotals } from "@/domain/investments";
import { parseYahooChart, yahooSymbol } from "@/domain/quotes";

describe("buy and sell", () => {
  test("buying updates the average price including fees", () => {
    // 100 a R$ 10,00 + 100 a R$ 12,00 + R$ 2,00 de taxa → PM R$ 11,01
    expect(applyBuy({ quantity: 100, avgPriceCents: 1000 }, { quantity: 100, priceCents: 1200, feesCents: 200 })).toEqual({ quantity: 200, avgPriceCents: 1101 });
  });

  test("first purchase sets the average", () => {
    expect(applyBuy({ quantity: 0, avgPriceCents: 0 }, { quantity: 10, priceCents: 3000, feesCents: 0 })).toEqual({ quantity: 10, avgPriceCents: 3000 });
  });

  test("selling keeps the average and realizes the gain minus fees", () => {
    expect(applySell({ quantity: 300, avgPriceCents: 1775 }, { quantity: 100, priceCents: 2711, feesCents: 100 })).toEqual({ quantity: 200, avgPriceCents: 1775, realizedCents: 93500 });
  });

  test("selling everything zeroes the position", () => {
    expect(applySell({ quantity: 10, avgPriceCents: 1000 }, { quantity: 10, priceCents: 900, feesCents: 0 })).toEqual({ quantity: 0, avgPriceCents: 0, realizedCents: -1000 });
  });

  test("cannot sell more than you have", () => {
    expect(() => applySell({ quantity: 5, avgPriceCents: 1000 }, { quantity: 6, priceCents: 1000, feesCents: 0 })).toThrow("só tem 5");
  });
});

describe("portfolio", () => {
  const bbas = holdingView({ ticker: "BBAS3", kind: "ACAO", quantity: 1324, avgPriceCents: 2400, dividendsCents: 217451 }, 1647);

  test("value, gain and return with dividends", () => {
    expect(bbas).toMatchObject({ investedCents: 3177600, valueCents: 2180628, gainCents: -996972 });
    expect(bbas.gainPct).toBeCloseTo(-0.31375, 4);
    expect(bbas.totalReturnPct).toBeCloseTo((2180628 + 217451 - 3177600) / 3177600, 6);
  });

  test("without a quote, the average price is used", () => {
    expect(holdingView({ ticker: "X", kind: "FII", quantity: 2, avgPriceCents: 1000, dividendsCents: 0 }, null)).toMatchObject({ valueCents: 2000, quoteMissing: true });
  });

  test("totals by kind", () => {
    const t = portfolioTotals([bbas, holdingView({ ticker: "KNCR11", kind: "FII", quantity: 20, avgPriceCents: 10470, dividendsCents: 51150 }, 10498)]);
    expect(t.byKind.ACAO.valueCents).toBe(2180628);
    expect(t.byKind.FII.valueCents).toBe(209960);
    expect(t.valueCents).toBe(2180628 + 209960);
    expect(t.dividendsCents).toBe(217451 + 51150);
  });
});

describe("quotes", () => {
  test("B3 tickers use the .SA suffix; the dollar uses BRL=X", () => {
    expect(yahooSymbol("BBAS3")).toBe("BBAS3.SA");
    expect(yahooSymbol("USDBRL")).toBe("BRL=X");
  });

  test("reads price and daily change from the chart response", () => {
    const json = { chart: { result: [{ meta: { regularMarketPrice: 16.47, chartPreviousClose: 16.0 } }], error: null } };
    expect(parseYahooChart(json)).toEqual({ priceCents: 1647, changePct: (16.47 - 16) / 16 });
  });

  test("missing data gives null", () => {
    expect(parseYahooChart({ chart: { result: null, error: { code: "Not Found" } } })).toBeNull();
  });
});

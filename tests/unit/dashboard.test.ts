import { describe, expect, test } from "vitest";
import { coverageYears, summarizeMonth, type DashTx } from "@/domain/dashboard";

const tx = (over: Partial<DashTx>): DashTx => ({
  type: "EXPENSE",
  month: "2026-10",
  amountCents: 0,
  categoryId: "mercado",
  countsInCostOfLiving: true,
  projectId: null,
  isTransferToInvestment: false,
  ...over,
});

const history = (cents: number) => ["2026-07", "2026-08", "2026-09"].map((month) => ({ month, categoryId: "mercado", cents }));

describe("summarizeMonth", () => {
  test("20% above the 3-month average is exactly 0.2", () => {
    const s = summarizeMonth({ month: "2026-10", txs: [tx({ amountCents: 120000 })], history: history(100000) });
    expect(s.byCategory[0]).toEqual({ categoryId: "mercado", cents: 120000, avg3Cents: 100000, overPct: 0.2 });
  });

  test("30% above", () => {
    const s = summarizeMonth({ month: "2026-10", txs: [tx({ amountCents: 130000 })], history: history(100000) });
    expect(s.byCategory[0].overPct).toBeCloseTo(0.3);
  });

  test("no history means no comparison", () => {
    const s = summarizeMonth({ month: "2026-10", txs: [tx({ amountCents: 5000 })], history: [] });
    expect(s.byCategory[0].overPct).toBeNull();
  });

  test("missing months count as zero in the average", () => {
    const s = summarizeMonth({ month: "2026-10", txs: [tx({ amountCents: 5000 })], history: [{ month: "2026-09", categoryId: "mercado", cents: 30000 }] });
    expect(s.byCategory[0].avg3Cents).toBe(10000);
  });

  test("projects and categories outside cost of living are excluded from it", () => {
    const s = summarizeMonth({
      month: "2026-10",
      txs: [
        tx({ amountCents: 1000 }),
        tx({ amountCents: 5000, categoryId: "projetos", countsInCostOfLiving: false, projectId: "sotao" }),
        tx({ amountCents: 700, categoryId: "saude", projectId: "sotao" }),
        tx({ amountCents: 300, categoryId: "reembolsavel", countsInCostOfLiving: false }),
      ],
      history: [],
    });
    expect(s.expenseCents).toBe(7000);
    expect(s.costOfLivingCents).toBe(1000);
    expect(s.byProject).toEqual([{ projectId: "sotao", cents: 5700 }]);
  });

  test("transfers to investments are counted apart from expenses", () => {
    const s = summarizeMonth({
      month: "2026-10",
      txs: [tx({ type: "INCOME", amountCents: 9000, categoryId: "salario" }), tx({ type: "TRANSFER", amountCents: 2000, categoryId: null, isTransferToInvestment: true })],
      history: [],
    });
    expect(s).toMatchObject({ incomeCents: 9000, expenseCents: 0, investedCents: 2000 });
  });

  test("categories are sorted by amount", () => {
    const s = summarizeMonth({ month: "2026-10", txs: [tx({ amountCents: 100 }), tx({ amountCents: 900, categoryId: "saude" })], history: [] });
    expect(s.byCategory.map((c) => c.categoryId)).toEqual(["saude", "mercado"]);
  });
});

test("coverageYears", () => {
  expect(coverageYears(120000000, 1000000)).toBeCloseTo(10);
  expect(coverageYears(100, 0)).toBeNull();
});

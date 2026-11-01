import { expect, test } from "vitest";
import { parseZak26 } from "@/domain/zak26/parse";
import { detectSeries } from "@/domain/zak26/series";
import { monthSheet, sctSheet } from "./fixtures/zak26-grid";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("a credit row repeated across months becomes one series candidate", () => {
  const { rows } = parseZak26([sctSheet("Jan"), sctSheet("Fev"), sctSheet("Mar")], { year: 2026, lastMonth: "2026-11" });
  const series = detectSeries(rows);
  expect(series).toHaveLength(1);
  expect(series[0]).toMatchObject({
    description: "SCT",
    installmentCents: 93333,
    purchaseDate: d("2025-11-20"),
    months: ["2026-01", "2026-02", "2026-03"],
    importKeys: ["ZAK26:Jan:B172", "ZAK26:Fev:B172", "ZAK26:Mar:B172"],
  });
});

test("a single occurrence or a debit row is not a series", () => {
  const jan = monthSheet("Jan", { A98: "celesc", B98: 100, C98: d("2026-01-20") }, { 109: 100 });
  const fev = monthSheet("Fev", { A98: "celesc", B98: 100, C98: d("2026-01-20") }, { 109: 100 });
  const { rows } = parseZak26([jan, fev, sctSheet("Mar")], { year: 2026, lastMonth: "2026-11" });
  expect(detectSeries(rows)).toHaveLength(0);
});

test("small differences in the amount (up to R$ 1,00) still form one series", () => {
  const jan = monthSheet("Jan", { A172: "SCT", B172: 933.37, C172: d("2025-11-20") }, { 190: 933.37 });
  const { rows } = parseZak26([jan, sctSheet("Fev"), sctSheet("Mar")], { year: 2026, lastMonth: "2026-11" });
  const series = detectSeries(rows);
  expect(series).toHaveLength(1);
  expect(series[0].months).toEqual(["2026-01", "2026-02", "2026-03"]);
  expect(series[0].installmentCents).toBe(93333);
});

test("same store and date but clearly different amounts are different purchases", () => {
  const a = (name: string) => monthSheet(name, { A172: "pp", B172: 51.5, C172: d("2026-09-15"), A173: "pp", B173: 308.9, C173: d("2026-09-15") }, { 190: 360.4 });
  const series = detectSeries(parseZak26([a("Set"), a("Out")], { year: 2026, lastMonth: "2026-11" }).rows);
  expect(series.map((s) => s.installmentCents).sort((x, y) => x - y)).toEqual([5150, 30890]);
});

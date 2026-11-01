import { expect, test } from "vitest";
import { addMonthKey, currentMonthKey, monthEnd, monthKey, monthLabel, monthStart } from "@/lib/months";

test("addMonthKey crosses years", () => {
  expect(addMonthKey("2026-12", 1)).toBe("2027-01");
  expect(addMonthKey("2026-01", -1)).toBe("2025-12");
  expect(addMonthKey("2026-03", 14)).toBe("2027-05");
});

test("monthKey of a calendar date", () => {
  expect(monthKey(new Date("2026-10-31T00:00:00Z"))).toBe("2026-10");
});

test("monthLabel in pt-BR", () => {
  expect(monthLabel("2026-10")).toBe("out/2026");
  expect(monthLabel("2026-02")).toBe("fev/2026");
});

test("monthStart and monthEnd", () => {
  expect(monthStart("2026-02")).toEqual(new Date("2026-02-01T00:00:00Z"));
  expect(monthEnd("2026-02")).toEqual(new Date("2026-02-28T00:00:00Z"));
});

test("currentMonthKey uses Sao Paulo time", () => {
  // 02:00 UTC on Nov 1 is still Oct 31 in São Paulo (UTC-3).
  expect(currentMonthKey(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10");
});

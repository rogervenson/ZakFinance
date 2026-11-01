import { describe, expect, test } from "vitest";
import { installmentMonths, invoiceDates, invoiceMonthFor, splitInstallments } from "@/domain/invoices";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("invoiceMonthFor (closing 12, due 20)", () => {
  test("day after closing goes to next cycle", () => expect(invoiceMonthFor(d("2026-09-13"), 12, 20)).toBe("2026-10"));
  test("closing day itself belongs to the invoice closing that day", () => expect(invoiceMonthFor(d("2026-10-12"), 12, 20)).toBe("2026-10"));
  test("purchase after closing moves to the next invoice", () => expect(invoiceMonthFor(d("2026-10-13"), 12, 20)).toBe("2026-11"));
  test("due day before closing day means due next month", () => expect(invoiceMonthFor(d("2026-10-30"), 25, 5)).toBe("2026-12"));
  test("closing day 31 clamps in February", () => expect(invoiceMonthFor(d("2026-02-28"), 31, 10)).toBe("2026-03"));
  test("year rollover", () => expect(invoiceMonthFor(d("2026-12-20"), 12, 20)).toBe("2027-01"));
});

describe("invoiceDates", () => {
  test("closing in previous month when due day ≤ closing day", () => {
    expect(invoiceDates("2026-02", 31, 10)).toEqual({ closingDate: d("2026-01-31"), dueDate: d("2026-02-10") });
  });
  test("same month when due day > closing day", () => {
    expect(invoiceDates("2026-10", 12, 20)).toEqual({ closingDate: d("2026-10-12"), dueDate: d("2026-10-20") });
  });
  test("due day 31 clamps to month length", () => {
    expect(invoiceDates("2026-04", 25, 31).dueDate).toEqual(d("2026-04-30"));
  });
});

test("installmentMonths", () => {
  expect(installmentMonths("2026-11", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
});

test("splitInstallments puts the remainder on the first", () => {
  expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
  expect(splitInstallments(9000, 3)).toEqual([3000, 3000, 3000]);
});

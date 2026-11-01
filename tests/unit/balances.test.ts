import { expect, test } from "vitest";
import { computeBalance } from "@/domain/balances";

const zero = { income: 0, expense: 0, transferOut: 0, transferIn: 0 };

test("checking: opening + income − expense − transfers out + transfers in", () => {
  expect(computeBalance("CHECKING", 1000, { income: 500, expense: 200, transferOut: 100, transferIn: 50 })).toBe(1250);
});

test("credit card shows the debt: purchases − payments − refunds", () => {
  expect(computeBalance("CREDIT_CARD", 0, { ...zero, expense: 3000, transferIn: 1000, income: 200 })).toBe(1800);
});

test("no movement keeps the opening balance", () => {
  expect(computeBalance("SAVINGS", 777, zero)).toBe(777);
});

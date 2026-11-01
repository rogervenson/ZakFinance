import { describe, expect, test } from "vitest";
import { formatBRL, parseBRL, toCents } from "@/lib/money";

const nbsp = (s: string) => s.replace(/\u00a0/g, " ");

describe("parseBRL", () => {
  test("Brazilian format with thousands and decimal", () => expect(parseBRL("1.234,56")).toBe(123456));
  test("comma decimal without thousands", () => expect(parseBRL("1234,56")).toBe(123456));
  test("single decimal digit", () => expect(parseBRL("12,5")).toBe(1250));
  test("currency prefix", () => expect(parseBRL("R$ 50")).toBe(5000));
  test("dot decimal", () => expect(parseBRL("1234.56")).toBe(123456));
  test("dot as thousands when 3 digits follow", () => expect(parseBRL("1.234")).toBe(123400));
  test("zero rejected", () => expect(parseBRL("0")).toBeNull());
  test("negative rejected", () => expect(parseBRL("-10")).toBeNull());
  test("garbage rejected", () => expect(parseBRL("abc")).toBeNull());
  test("empty rejected", () => expect(parseBRL("  ")).toBeNull());
});

test("formatBRL", () => {
  expect(nbsp(formatBRL(123456))).toBe("R$ 1.234,56");
  expect(nbsp(formatBRL(-5000))).toBe("-R$ 50,00");
});

test("toCents rounds sheet floats", () => {
  expect(toCents(538.53)).toBe(53853);
  expect(toCents(0.1 + 0.2)).toBe(30);
});

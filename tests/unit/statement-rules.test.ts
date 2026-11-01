import { describe, expect, test } from "vitest";
import { classifyAccountLine, cleanDescription } from "@/domain/statements/classify";
import { matchLines } from "@/domain/statements/match";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("classifyAccountLine", () => {
  test("salary", () => expect(classifyAccountLine("LIQUIDO DE VENCIMENTO CNPJ 054083035000160", 530344, null)).toMatchObject({ type: "INCOME", category: "Salário" }));
  test("card invoice payment", () => expect(classifyAccountLine("DEBITO AUT. FAT.CARTAO MASTER CARD FINAL 3051", -940085, null)).toMatchObject({ type: "TRANSFER", to: "card" }));
  test("transfer to the savings account", () => expect(classifyAccountLine("TRANSFERENCIA PROGRAMADA PARA: 0159.60.016861-9", -20000, "016861-9")).toMatchObject({ type: "TRANSFER", to: "savings" }));
  test("account yield and broker credits are dividends", () => {
    expect(classifyAccountLine("REMUNERACAO APLICACAO AUTOMATICA", 5, null)).toMatchObject({ type: "INCOME", category: "Dividendos" });
    expect(classifyAccountLine("CREDITO DA SANTANDER CORRETORA", 1302, null)).toMatchObject({ type: "INCOME", category: "Dividendos" });
  });
  test("returned pix is a refund", () => expect(classifyAccountLine("PIX DEVOLVIDO SHPP BRASIL", 10640, null)).toMatchObject({ type: "INCOME", category: "Estorno" }));
  test("anything else follows the sign, without category", () => {
    expect(classifyAccountLine("PIX ENVIADO Fulano", -5000, null)).toEqual({ type: "EXPENSE", to: null, category: null });
    expect(classifyAccountLine("PIX RECEBIDO Fulano", 5000, null)).toEqual({ type: "INCOME", to: null, category: null });
  });
});

test("cleanDescription removes CNPJ numbers and extra spaces", () => {
  expect(cleanDescription("LIQUIDO DE VENCIMENTO CNPJ 054083035000160")).toBe("LIQUIDO DE VENCIMENTO");
  expect(cleanDescription("PIX ENVIADO   Fulano")).toBe("PIX ENVIADO Fulano");
});

describe("matchLines", () => {
  const ex = (id: string, iso: string, cents: number, extra: Record<string, unknown> = {}) => ({ id, date: d(iso), amountCents: cents, description: id, invoiceMonth: null, ...extra });
  const inc = (key: string, iso: string, cents: number, extra: Record<string, unknown> = {}) => ({ key, date: d(iso), amountCents: cents, description: key, invoiceMonth: null, ...extra });

  test("same amount and direction within the window, closest date wins, each used once", () => {
    const m = matchLines([inc("a", "2026-09-08", -41114), inc("b", "2026-09-21", -10460), inc("c", "2026-09-22", -10460)], [ex("x", "2026-09-05", -41114), ex("y", "2026-09-20", -10460)], { maxDays: 5 });
    expect(m.get("a")).toBe("x");
    expect(m.get("b")).toBe("y");
    expect(m.has("c")).toBe(false);
  });

  test("opposite direction or too far does not match", () => {
    const m = matchLines([inc("a", "2026-09-08", 5000), inc("b", "2026-09-30", -5000)], [ex("x", "2026-09-08", -5000)], { maxDays: 5 });
    expect(m.size).toBe(0);
  });

  test("card lines match inside the same invoice regardless of purchase date", () => {
    const m = matchLines([inc("sct", "2025-11-20", 93333, { invoiceMonth: "2026-10" })], [ex("row", "2025-11-20", 93333, { invoiceMonth: "2026-10" }), ex("other", "2025-11-20", 93333, { invoiceMonth: "2026-09" })], { maxDays: 5 });
    expect(m.get("sct")).toBe("row");
  });
});

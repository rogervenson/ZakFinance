import { describe, expect, test } from "vitest";
import { detectStatementKind } from "@/domain/statements/detect";
import { parseSantanderAccount } from "@/domain/statements/santander-account";
import { parseSantanderCard } from "@/domain/statements/santander-card";
import { ACCOUNT_STATEMENT, CARD_INVOICE } from "./fixtures/santander-text";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test("detects the kind of document", () => {
  expect(detectStatementKind(ACCOUNT_STATEMENT)).toBe("SANTANDER_ACCOUNT");
  expect(detectStatementKind(CARD_INVOICE)).toBe("SANTANDER_CARD");
  expect(detectStatementKind("qualquer outra coisa")).toBeNull();
});

describe("Santander account statement", () => {
  const s = parseSantanderAccount(ACCOUNT_STATEMENT);

  test("month and lines with signed amounts", () => {
    expect(s.month).toBe("2026-09");
    expect(s.lines.map((l) => [l.date.toISOString().slice(0, 10), l.description, l.amountCents])).toEqual([
      ["2026-09-01", "PIX RECEBIDO Fulano de Tal Souza", 100180],
      ["2026-09-01", "PIX ENVIADO LOJA EXEMPLO PAGAMENTOS", -18639],
      ["2026-09-03", "PIX RECEBIDO BELTRANO SILVA", 19300],
      ["2026-09-04", "LIQUIDO DE VENCIMENTO CNPJ 054083035000160", 530344],
      ["2026-09-04", "PIX DEVOLVIDO LOJA EXEMPLO PAGAMENTOS", 10640],
      ["2026-09-04", "PIX ENVIADO LOJA EXEMPLO PAGAMENTOS", -20852],
      ["2026-09-08", "DEBITO AUT. CONTA AGUA E ESGOTO AGUAS JOINVILLE", -41114],
      ["2026-09-08", "REMUNERACAO APLICACAO AUTOMATICA", 5],
      ["2026-09-10", "TRANSFERENCIA PROGRAMADA PARA: 0159.60.016861-9", -20000],
      ["2026-09-21", "DEBITO AUT. FAT.CARTAO MASTER CARD FINAL 3051", -500000],
      ["2026-09-21", "CREDITO DA SANTANDER CORRETORA", 1302],
    ]);
  });

  test("opening and closing balances, and running balances agree", () => {
    expect(s.openingCents).toBe(245851);
    expect(s.closingCents).toBe(307017);
    expect(s.issues).toEqual([]);
  });

  test("savings and fund balances, and the savings account number", () => {
    expect(s.savingsCents).toBe(101797);
    expect(s.fundCents).toBe(1237835);
    expect(s.savingsAccount).toBe("016861-9");
  });

  test("a running balance that does not add up is reported", () => {
    const broken = parseSantanderAccount(ACCOUNT_STATEMENT.replace("- 186,39- 3.273,92", "- 186,39- 3.000,00"));
    expect(broken.issues.length).toBeGreaterThan(0);
  });
});

describe("Santander card invoice", () => {
  const c = parseSantanderCard(CARD_INVOICE);

  test("header: total, due date, cycle", () => {
    expect(c).toMatchObject({ totalCents: 203825, dueDate: d("2026-10-21"), closingDate: d("2026-10-14"), month: "2026-10" });
  });

  test("lines with cardholder, installments, year inference and USD", () => {
    const rows = c.lines.map((l) => [l.date.toISOString().slice(0, 10), l.description, l.amountCents, l.installment ? `${l.installment.n}/${l.installment.of}` : null, l.cardLast4]);
    expect(rows).toEqual([
      ["2026-10-13", "LOJA PARCELADA", 26666, "12/12", "3051"],
      ["2025-11-20", "SCT", 93333, "11/12", "3051"],
      ["2026-09-19", "RINOFIX", 2200, null, "3051"],
      ["2026-09-17", "CLINICA EXEMPLO", 30000, "1/3", "8401"],
      ["2026-09-16", "MERCADO VITORINO", 53853, null, "8401"],
      ["2026-09-22", "ESTORNO LOJA", -10000, null, "4159"],
      ["2026-09-28", "AIRALO", 7510, null, "4159"],
      ["2026-09-28", "IOF DESPESA NO EXTERIOR", 263, null, "4159"],
    ]);
    expect(c.lines.find((l) => l.description === "AIRALO")?.usdCents).toBe(1350);
    expect(c.lines.find((l) => l.description === "CLINICA EXEMPLO")?.cardholder).toBe("CICLANA DE TAL");
  });

  test("payments and zero-value lines are not purchases; the sum matches the total", () => {
    expect(c.paymentsCents).toBe(940085);
    expect(c.lines.some((l) => l.description.startsWith("ANUIDADE"))).toBe(false);
    expect(c.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(c.totalCents);
    expect(c.issues).toEqual([]);
  });
});

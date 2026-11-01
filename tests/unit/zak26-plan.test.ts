import { describe, expect, test } from "vitest";
import { parseZak26 } from "@/domain/zak26/parse";
import { balanceAt, planZakImport, simulateChecking, type PlanContext } from "@/domain/zak26/plan";
import { geral, inv, monthSheet, OUT } from "./fixtures/zak26-grid";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const ctx: PlanContext = {
  accounts: { checking: "chk", card: "card", savings: "sav", broker: "brk", ticket: "tkt" },
  card: { closingDay: 12, dueDay: 20 },
  categories: (kind, name) => `${kind}:${name}`,
  projects: { Sótão: "p-sotao", Agro: "p-agro" },
  currentMonth: "2026-11",
};

const parsed = parseZak26([OUT, geral, inv], { year: 2026, lastMonth: "2026-11" });
const plan = planZakImport(parsed, ctx);
const byKey = (k: string) => plan.find((p) => p.importKey === k)!;

describe("planZakImport", () => {
  test("credit row goes to the card, invoice = sheet month even with an older date", () => {
    expect(byKey("ZAK26:Out:B53")).toMatchObject({ type: "EXPENSE", accountId: "card", invoiceMonth: "2026-10", month: "2026-10", date: d("2026-09-16"), categoryId: "EXPENSE:Mercado" });
  });

  test("debit row goes to checking with the month of the sheet", () => {
    expect(byKey("ZAK26:Out:B98")).toMatchObject({ type: "EXPENSE", accountId: "chk", invoiceMonth: null, month: "2026-10", categoryId: "EXPENSE:Mercado" });
  });

  test("project blocks use the Projetos category plus the project", () => {
    expect(byKey("ZAK26:Out:B316")).toMatchObject({ categoryId: "EXPENSE:Projetos", projectId: "p-sotao", accountId: "card" });
  });

  test("reimbursable before the current month is settled", () => {
    expect(byKey("ZAK26:Out:B223")).toMatchObject({ categoryId: "EXPENSE:Reembolsável", reimbursable: true, reimbursementStatus: "SETTLED" });
  });

  test("reimbursable in the current month stays pending", () => {
    const nov = monthSheet("Nov", { A223: "jandir", B223: 193, C223: d("2026-11-03") }, { 240: 193 });
    const p = planZakImport(parseZak26([nov], { year: 2026, lastMonth: "2026-11" }), ctx);
    expect(p[0]).toMatchObject({ reimbursementStatus: "PENDING" });
  });

  test("income rows map to categories by description", () => {
    expect(byKey("ZAK26:Out:B3")).toMatchObject({ type: "INCOME", accountId: "chk", categoryId: "INCOME:Salário" });
    expect(byKey("ZAK26:Out:B5").categoryId).toBe("INCOME:Aluguel/Ajuda");
    expect(byKey("ZAK26:Out:B13").categoryId).toBe("INCOME:Dividendos");
  });

  test("investment to poupança is a transfer to savings", () => {
    expect(byKey("ZAK26:Out:B43")).toMatchObject({ type: "TRANSFER", accountId: "chk", toAccountId: "sav", categoryId: null });
  });

  test("ticket becomes income and Mercado expense on the Ticket account", () => {
    expect(byKey("ZAK26:Geral:K7:in")).toMatchObject({ type: "INCOME", accountId: "tkt", amountCents: 95400, categoryId: "INCOME:Ticket", date: d("2026-10-01") });
    expect(byKey("ZAK26:Geral:K7:out")).toMatchObject({ type: "EXPENSE", accountId: "tkt", amountCents: 95400, categoryId: "EXPENSE:Mercado" });
  });

  test("past month with credit rows gets a paid invoice transfer on the due date", () => {
    expect(byKey("ZAK26:fatura:2026-10")).toMatchObject({
      type: "TRANSFER",
      accountId: "chk",
      toAccountId: "card",
      paysInvoiceMonth: "2026-10",
      amountCents: 53853 + 26592 + 1000 + 3791,
      date: d("2026-10-20"),
    });
  });

  test("current month credit rows have no payment yet", () => {
    const nov = monthSheet("Nov", { A53: "giassi", B53: 50, C53: d("2026-10-20") }, { 96: 50 });
    const p = planZakImport(parseZak26([nov], { year: 2026, lastMonth: "2026-11" }), ctx);
    expect(p.find((x) => x.importKey === "ZAK26:fatura:2026-11")).toBeUndefined();
  });
});

test("simulateChecking reproduces the month-end checking balance", () => {
  const balances = simulateChecking(plan, 100000, ctx.accounts.checking);
  // Out: +4818,42 +907,20 +0,85 − 200 (poupança) − 106,24 (celesc) − 579 (gisele) − fatura 852,36
  expect(balances.get("2026-10")).toBe(100000 + 481842 + 90720 + 85 - 20000 - 10624 - 57900 - 85236);
});

test("balanceAt carries the last known balance into months without checking movement", () => {
  const sim = new Map([["2026-01", 500], ["2026-03", 900]]);
  expect(balanceAt(sim, "2026-02", 100)).toBe(500);
  expect(balanceAt(sim, "2026-11", 100)).toBe(900);
  expect(balanceAt(sim, "2025-12", 100)).toBe(100);
});

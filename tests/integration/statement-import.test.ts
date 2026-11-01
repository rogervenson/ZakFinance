import { beforeEach, describe, expect, test } from "vitest";
import { db } from "@/server/db";
import { confirmStatementText, previewStatementText, type StatementPreview } from "@/server/services/statement-import";
import { accountBalance } from "@/server/services/accounts";
import { createTransaction } from "@/server/services/transactions";
import { ACCOUNT_STATEMENT, CARD_INVOICE } from "../unit/fixtures/santander-text";
import { ids, wipeTransactions } from "./helpers";

let I: Awaited<ReturnType<typeof ids>>;

beforeEach(async () => {
  await wipeTransactions();
  I = await ids();
});

/** Decisões padrão da prévia, com categoria de reserva para o que veio sem sugestão. */
const decide = (p: StatementPreview) =>
  p.rows.map((r) => ({
    key: r.key,
    include: r.status === "NEW",
    type: r.type,
    categoryId: r.type === "TRANSFER" ? null : (r.categoryId ?? I.cat("Outros", r.type === "INCOME" ? "INCOME" : "EXPENSE")),
    toAccountId: r.toAccountId,
    description: r.description,
  }));

describe("account statement", () => {
  test("preview classifies, and importing creates every new line once", async () => {
    const p = await previewStatementText(ACCOUNT_STATEMENT);
    expect(p.kind).toBe("SANTANDER_ACCOUNT");
    expect(p.rows).toHaveLength(11);
    expect(p.rows.every((r) => r.status === "NEW")).toBe(true);
    expect(p.rows.find((r) => r.description.startsWith("LIQUIDO"))).toMatchObject({ type: "INCOME", categoryId: I.cat("Salário", "INCOME") });
    expect(p.rows.find((r) => r.description.startsWith("TRANSFERENCIA"))).toMatchObject({ type: "TRANSFER", toAccountId: I.savings });
    expect(p.snapshots).toEqual([
      { assetClass: "Poupança", cents: 101797 },
      { assetClass: "Fundos", cents: 1237835 },
    ]);

    const r = await confirmStatementText(ACCOUNT_STATEMENT, { decisions: decide(p) });
    expect(r.created).toBe(11);
    expect(await accountBalance(I.savings)).toBe(20000);
    const again = await previewStatementText(ACCOUNT_STATEMENT);
    expect(again.rows.every((x) => x.status === "IMPORTED")).toBe(true);
    expect((await confirmStatementText(ACCOUNT_STATEMENT, { decisions: decide(again) })).created).toBe(0);
  });

  test("a line already entered by hand is recognized and not duplicated", async () => {
    await createTransaction({ type: "EXPENSE", date: "2026-09-06", description: "agua", amount: "411,14", accountId: I.checking, categoryId: I.cat("Mercado") });
    const p = await previewStatementText(ACCOUNT_STATEMENT);
    expect(p.rows.find((r) => r.description.includes("AGUA E ESGOTO"))).toMatchObject({ status: "MATCHED", matchedDescription: "agua" });
    await confirmStatementText(ACCOUNT_STATEMENT, { decisions: decide(p) });
    expect(await db.transaction.count({ where: { amountCents: 41114 } })).toBe(1);
  });

  test("balance adjustment makes the month end match the statement, and snapshots are updated", async () => {
    const p = await previewStatementText(ACCOUNT_STATEMENT);
    await confirmStatementText(ACCOUNT_STATEMENT, { decisions: decide(p), adjustBalance: true, updateSnapshots: true });
    expect(await accountBalance(I.checking, new Date("2026-09-30T00:00:00Z"))).toBe(307017);
    expect(await db.assetSnapshot.findUnique({ where: { month_assetClass: { month: "2026-09", assetClass: "Poupança" } } })).toMatchObject({ valueCents: 101797 });
  });

  test("the card debit pays the unpaid invoice with the same total", async () => {
    await createTransaction({ type: "EXPENSE", date: "2026-08-20", description: "compra", amount: "5.000,00", accountId: I.card, categoryId: I.cat("Despesas") });
    const p = await previewStatementText(ACCOUNT_STATEMENT);
    await confirmStatementText(ACCOUNT_STATEMENT, { decisions: decide(p) });
    const inv = await db.invoice.findFirstOrThrow({ where: { accountId: I.card, month: "2026-09" } }); // 20/08 é depois do fechamento (14)
    expect(inv.status).toBe("PAID");
  });
});

describe("card invoice", () => {
  test("imports purchases into the invoice of the document and creates installment plans", async () => {
    const p = await previewStatementText(CARD_INVOICE);
    expect(p.kind).toBe("SANTANDER_CARD");
    expect(p.month).toBe("2026-10");
    expect(p.check.documentCents).toBe(203825);
    const r = await confirmStatementText(CARD_INVOICE, { decisions: decide(p) });
    expect(r.plans).toBe(3); // 12/12 também vira plano (sem parcelas futuras)
    const inv = await db.invoice.findFirstOrThrow({ where: { accountId: I.card, month: "2026-10" } });
    expect(inv.dueDate).toEqual(new Date("2026-10-21T00:00:00Z"));
    const { invoiceTotal } = await import("@/server/services/invoices");
    expect(await invoiceTotal(inv.id)).toBe(203825);
    // SCT 11/12 → a 12ª vai para a fatura de nov/2026; Clínica 1/3 → 2ª e 3ª em nov e dez.
    const future = await db.transaction.findMany({ where: { month: { gt: "2026-10" } }, orderBy: [{ month: "asc" }, { description: "asc" }] });
    expect(future.map((t) => `${t.month} ${t.description}`)).toEqual(["2026-11 CLINICA EXEMPLO (2/3)", "2026-11 SCT (12/12)", "2026-12 CLINICA EXEMPLO (3/3)"]);
    expect((await previewStatementText(CARD_INVOICE)).rows.every((x) => x.status === "IMPORTED")).toBe(true);
  });

  test("an installment already imported from the spreadsheet gets linked and continued", async () => {
    // Linha da planilha: SCT na fatura de out/2026, sem parcelamento.
    const inv = await db.invoice.create({ data: { accountId: I.card, month: "2026-10", closingDate: new Date("2026-10-14T00:00:00Z"), dueDate: new Date("2026-10-21T00:00:00Z") } });
    await db.transaction.create({
      data: { type: "EXPENSE", date: new Date("2025-11-20T00:00:00Z"), month: "2026-10", description: "SCT", amountCents: 93333, accountId: I.card, categoryId: I.cat("Saúde"), invoiceId: inv.id, source: "ZAK26" },
    });
    const p = await previewStatementText(CARD_INVOICE);
    expect(p.rows.find((r) => r.description === "SCT")).toMatchObject({ status: "MATCHED", installment: "11/12" });
    await confirmStatementText(CARD_INVOICE, { decisions: decide(p) });
    const sct = await db.transaction.findMany({ where: { description: { startsWith: "SCT" } }, orderBy: { month: "asc" } });
    expect(sct.map((t) => [t.month, t.installmentNumber])).toEqual([
      ["2026-10", 11],
      ["2026-11", 12],
    ]);
  });
});

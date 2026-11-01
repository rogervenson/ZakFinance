import { beforeEach, describe, expect, test } from "vitest";
import ExcelJS from "exceljs";
import { db } from "@/server/db";
import { confirmSeries, confirmZakImport, listPendingSeries, previewZakImport, undoZakImport } from "@/server/services/zak-import";
import { createTransaction } from "@/server/services/transactions";
import { colLetter, type Grid } from "@/domain/zak26/grid";
import { geral, inv, OUT, sctSheet } from "../unit/fixtures/zak26-grid";
import { ids, wipeTransactions } from "./helpers";

async function workbook(grids: Grid[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const g of grids) {
    const ws = wb.addWorksheet(g.name);
    for (let r = 1; r <= g.rowCount; r++)
      for (let c = 1; c <= g.colCount; c++) {
        const v = g.get(r, c);
        if (v !== null && !(typeof v === "object" && !(v instanceof Date))) ws.getCell(`${colLetter(c)}${r}`).value = v;
      }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

let file: Buffer;
const NOW = "2026-11";

beforeEach(async () => {
  await wipeTransactions();
  file = await workbook([sctSheet("Jan"), sctSheet("Fev"), sctSheet("Mar"), OUT, geral, inv]);
});

describe("Zak26 import", () => {
  test("preview writes nothing and reports months, issues and series", async () => {
    const preview = await previewZakImport(file, NOW);
    expect(await db.transaction.count()).toBe(0);
    expect(preview.months.find((m) => m.month === "2026-10")?.rowCount).toBe(10);
    expect(preview.issues.some((i) => i.kind === "DATA_INVALIDA")).toBe(true);
    expect(preview.series).toHaveLength(1);
    expect(preview.alreadyImported).toBe(0);
  });

  test("import is idempotent and builds paid invoices, snapshots and holdings", async () => {
    const first = await confirmZakImport(file, NOW);
    expect(first.created).toBeGreaterThan(0);
    const again = await confirmZakImport(file, NOW);
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(first.created);

    const I = await ids();
    const oct = await db.invoice.findUniqueOrThrow({ where: { accountId_month: { accountId: I.card, month: "2026-10" } } });
    expect(oct.status).toBe("PAID");
    expect(await db.holding.count()).toBe(5);
    expect(await db.assetSnapshot.count({ where: { month: "2026-10" } })).toBe(4);
    const checking = await db.account.findUniqueOrThrow({ where: { id: I.checking } });
    expect(checking.openingBalanceCents).toBe(650263);
    expect((await db.importRun.count())).toBe(2);
  });

  test("undo removes only imported data", async () => {
    const I = await ids();
    await confirmZakImport(file, NOW);
    await createTransaction({ type: "EXPENSE", date: "2026-11-05", description: "manual", amount: "10", accountId: I.checking, categoryId: I.cat("Mercado") });
    await undoZakImport();
    const left = await db.transaction.findMany();
    expect(left.map((t) => t.description)).toEqual(["manual"]);
    expect(await db.holding.count()).toBe(0);
    expect((await db.account.findUniqueOrThrow({ where: { id: I.checking } })).openingBalanceCents).toBe(0);
  });

  test("confirming a series numbers the imported rows and creates the future installments", async () => {
    await confirmZakImport(file, NOW);
    const [series] = await listPendingSeries();
    expect(series.description).toBe("SCT");
    // Compra 20/11/2025, fecha dia 12 → 1ª parcela na fatura de dez/2025; jan, fev, mar = parcelas 2, 3, 4.
    await confirmSeries(series.key, 6);
    const rows = await db.transaction.findMany({ where: { installmentPlanId: { not: null } }, orderBy: { month: "asc" } });
    expect(rows.map((r) => [r.month, r.installmentNumber])).toEqual([
      ["2026-01", 2],
      ["2026-02", 3],
      ["2026-03", 4],
      ["2026-04", 5],
      ["2026-05", 6],
    ]);
    expect(rows[3].description).toBe("SCT (5/6)");
    expect(await listPendingSeries()).toHaveLength(0);
  });

  test("a total smaller than the installments already imported is rejected", async () => {
    await confirmZakImport(file, NOW);
    const [series] = await listPendingSeries();
    await expect(confirmSeries(series.key, 3)).rejects.toThrow("pelo menos 4");
  });
});

// Lê um .xlsx (exceljs) e entrega as abas como Grid, com o valor calculado das fórmulas.
import ExcelJS from "exceljs";
import type { Cell, Grid } from "@/domain/zak26/grid";

function toCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("error" in value) return { error: String(value.error) };
    if ("result" in value) return toCell((value as { result?: ExcelJS.CellValue }).result ?? null);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String((value as { text: unknown }).text);
  }
  return null;
}

export async function readWorkbook(buffer: Buffer | ArrayBuffer): Promise<Grid[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const rowCount = ws.actualRowCount ? ws.rowCount : 0;
    return {
      name: ws.name.trim(),
      rowCount,
      colCount: ws.columnCount,
      get: (row: number, col: number) => (row > rowCount ? null : toCell(ws.getRow(row).getCell(col).value)),
    };
  });
}

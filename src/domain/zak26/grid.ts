// Abstração de uma aba de planilha (1-based; coluna 1 = A). Células com fórmula
// chegam com o valor calculado guardado no arquivo.

export type Cell = string | number | Date | null | { error: string };

export interface Grid {
  name: string;
  rowCount: number;
  colCount: number;
  get(row: number, col: number): Cell;
}

/** Número da coluna → letra ("A", "B", … "AA"). */
export function colLetter(col: number): string {
  let s = "";
  for (let n = col; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export const ref = (row: number, col: number) => `${colLetter(col)}${row}`;

export const isNumber = (c: Cell): c is number => typeof c === "number" && Number.isFinite(c);

export const text = (c: Cell): string => (typeof c === "string" ? c.trim() : "");

/** Texto para comparar rótulos: minúsculo, sem acentos (e sem caracteres corrompidos). */
export function label(c: Cell): string {
  return text(c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Copia a grade para uma matriz simples (para guardar como JSON). */
export function toMatrix(grid: Grid, maxRows: number, maxCols: number): Cell[][] {
  const rows = Math.min(grid.rowCount, maxRows);
  const cols = Math.min(grid.colCount, maxCols);
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => grid.get(r + 1, c + 1)));
}

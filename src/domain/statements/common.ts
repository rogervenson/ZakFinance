// Utilidades dos leitores de extrato/fatura (texto extraído do PDF).

export const MONEY = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;

/** "1.234,56" → 123456. */
export function brlToCents(text: string): number {
  return Math.round(Number(text.replace(/\./g, "").replace(",", ".")) * 100);
}

export const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

export const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export interface StatementIssue {
  message: string;
}

/** Linhas não vazias, sem espaços nas pontas. */
export const linesOf = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

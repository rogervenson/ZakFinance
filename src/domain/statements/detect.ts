export type StatementKind = "SANTANDER_ACCOUNT" | "SANTANDER_CARD";

/** Reconhece o documento pelo texto. */
export function detectStatementKind(text: string): StatementKind | null {
  if (/EXTRATO CONSOLIDADO INTELIGENTE/i.test(text) && /Movimentação/.test(text)) return "SANTANDER_ACCOUNT";
  if (/Detalhamento da Fatura/i.test(text) && /Total a Pagar/i.test(text)) return "SANTANDER_CARD";
  return null;
}

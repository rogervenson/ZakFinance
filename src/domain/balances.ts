// Saldo de uma conta a partir das somas dos lançamentos (centavos).

export type AccountKind = "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "BENEFIT" | "INVESTMENT";

export interface MovementSums {
  income: number;
  expense: number;
  transferOut: number;
  transferIn: number;
}

/**
 * Contas comuns: saldo inicial + receitas − despesas − transferências enviadas + recebidas.
 * Cartão: devolve a DÍVIDA (compras − pagamentos − estornos), positiva quando há fatura em aberto.
 */
export function computeBalance(type: AccountKind, openingCents: number, s: MovementSums): number {
  if (type === "CREDIT_CARD") return openingCents + s.expense + s.transferOut - s.transferIn - s.income;
  return openingCents + s.income - s.expense - s.transferOut + s.transferIn;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountKind, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CREDIT_CARD: "Cartão de crédito",
  BENEFIT: "Benefício",
  INVESTMENT: "Investimentos",
};

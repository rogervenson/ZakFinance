// Cadastros iniciais (seed). Os nomes são usados também pela importação da Zak26.

export const ACCOUNT = {
  checking: "Conta Santander",
  card: "Cartão Santander",
  savings: "Poupança",
  broker: "Corretora",
  ticket: "Ticket",
} as const;

export const DEFAULT_ACCOUNTS = [
  { name: ACCOUNT.checking, type: "CHECKING", sortOrder: 1 },
  { name: ACCOUNT.card, type: "CREDIT_CARD", closingDay: 12, dueDay: 20, sortOrder: 2 },
  { name: ACCOUNT.savings, type: "SAVINGS", sortOrder: 3 },
  { name: ACCOUNT.broker, type: "INVESTMENT", sortOrder: 4 },
  { name: ACCOUNT.ticket, type: "BENEFIT", sortOrder: 5 },
] as const;

export const EXPENSE_CATEGORIES = [
  { name: "Mercado", countsInCostOfLiving: true },
  { name: "Despesas", countsInCostOfLiving: true },
  { name: "Saúde", countsInCostOfLiving: true },
  { name: "Carro", countsInCostOfLiving: true },
  { name: "Projetos", countsInCostOfLiving: false },
  { name: "Reembolsável", countsInCostOfLiving: false },
  { name: "Outros", countsInCostOfLiving: true },
  { name: "Ajuste de saldo", countsInCostOfLiving: false },
] as const;

export const INCOME_CATEGORIES = [
  { name: "Salário", continuesAfterRetirement: false },
  { name: "Adiantamento", continuesAfterRetirement: false },
  { name: "Quilometragem", continuesAfterRetirement: false },
  { name: "Ticket", continuesAfterRetirement: false },
  { name: "Aluguel/Ajuda", continuesAfterRetirement: true },
  { name: "Rove", continuesAfterRetirement: true },
  { name: "Dividendos", continuesAfterRetirement: false },
  { name: "Reembolso", continuesAfterRetirement: false },
  { name: "Estorno", continuesAfterRetirement: false },
  { name: "Outros", continuesAfterRetirement: false },
  { name: "Ajuste de saldo", continuesAfterRetirement: false },
] as const;

export const DEFAULT_PROJECTS = ["Sótão", "Agro"] as const;

/** Categoria usada para ajustes de saldo. */
export const ADJUSTMENT_CATEGORY = "Ajuste de saldo";

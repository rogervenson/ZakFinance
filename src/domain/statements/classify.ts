// Classificação automática das linhas do extrato da conta (o usuário pode mudar na prévia).

export interface AccountLineClass {
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  /** Destino de transferência reconhecido. */
  to: "savings" | "card" | null;
  /** Nome da categoria padrão, quando a regra sabe. */
  category: string | null;
}

export function classifyAccountLine(description: string, amountCents: number, savingsAccount: string | null): AccountLineClass {
  const d = description.toUpperCase();
  if (amountCents < 0 && /FAT\.?\s*CARTAO|FATURA.*CART/.test(d)) return { type: "TRANSFER", to: "card", category: null };
  if (amountCents < 0 && /TRANSFERENCIA/.test(d) && ((savingsAccount && d.includes(savingsAccount)) || /POUPAN/.test(d))) return { type: "TRANSFER", to: "savings", category: null };
  if (amountCents > 0) {
    if (/LIQUIDO DE VENCIMENTO|SALARIO|PROVENTOS/.test(d)) return { type: "INCOME", to: null, category: "Salário" };
    if (/REMUNERACAO APLICACAO|CREDITO DA SANTANDER CORRETORA|RENDIMENTO/.test(d)) return { type: "INCOME", to: null, category: "Dividendos" };
    if (/DEVOLVIDO|ESTORNO/.test(d)) return { type: "INCOME", to: null, category: "Estorno" };
    return { type: "INCOME", to: null, category: null };
  }
  return { type: "EXPENSE", to: null, category: null };
}

/** Tira números de CNPJ e espaços repetidos. */
export function cleanDescription(description: string): string {
  return description
    .replace(/\bCNPJ\s*\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

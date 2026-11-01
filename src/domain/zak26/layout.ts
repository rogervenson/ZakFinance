// Layout da planilha Zak26 (Google Sheets exportado): uma aba por mês com blocos
// que começam num cabeçalho na coluna A e terminam na linha com "Total:" na coluna B.

export const MONTH_SHEETS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;

export type BlockId =
  | "RECEITAS"
  | "DIVIDENDOS"
  | "REEMBOLSO_RECEBIDO"
  | "QUILOMETRAGEM"
  | "ROVE"
  | "INVESTIMENTO"
  | "MERCADO_CREDITO"
  | "MERCADO_DEBITO"
  | "DESPESAS_CREDITO"
  | "DESPESAS_DEBITO"
  | "SAUDE_CREDITO"
  | "SAUDE_DEBITO"
  | "REEMBOLSAVEL_CREDITO"
  | "REEMBOLSAVEL_DEBITO"
  | "CARRO_CREDITO"
  | "CARRO_DEBITO"
  | "AGRO_CREDITO"
  | "AGRO_DEBITO"
  | "SOTAO_CREDITO"
  | "SOTAO_DEBITO";

/**
 * Cabeçalhos reconhecidos, já normalizados por `label()` (sem acentos; letras
 * corrompidas somem, por isso "sa.{0,2}de" e "sot.{0,2}o").
 * Atenção: "Rembolso" sozinho é RECEITA (reembolso recebido); "Rembolso Crédito/Débito"
 * e "Rembolsavel Crédito/Débito" são DESPESAS reembolsáveis.
 */
const HEADERS: [RegExp, BlockId][] = [
  [/^receitas$/, "RECEITAS"],
  [/^dividendos$/, "DIVIDENDOS"],
  [/^rembolso$/, "REEMBOLSO_RECEBIDO"],
  [/^kilometragem$/, "QUILOMETRAGEM"],
  [/^rove$/, "ROVE"],
  [/^investimento$/, "INVESTIMENTO"],
  [/^mercado cr/, "MERCADO_CREDITO"],
  [/^mercado d/, "MERCADO_DEBITO"],
  [/^despesas cr/, "DESPESAS_CREDITO"],
  [/^despesas d/, "DESPESAS_DEBITO"],
  [/^sa.{0,2}de cr/, "SAUDE_CREDITO"],
  [/^sa.{0,2}de d/, "SAUDE_DEBITO"],
  [/^rembols\w* cr/, "REEMBOLSAVEL_CREDITO"],
  [/^rembols\w* d/, "REEMBOLSAVEL_DEBITO"],
  [/^carro cr/, "CARRO_CREDITO"],
  [/^carro d/, "CARRO_DEBITO"],
  [/^agro cr/, "AGRO_CREDITO"],
  [/^agro d/, "AGRO_DEBITO"],
  [/^sot.{0,2}o cr/, "SOTAO_CREDITO"],
  [/^sot.{0,2}o d/, "SOTAO_DEBITO"],
];

export function matchHeader(normalized: string): BlockId | null {
  for (const [re, id] of HEADERS) if (re.test(normalized)) return id;
  return null;
}

export function paymentOf(block: BlockId): "CREDITO" | "DEBITO" | null {
  if (block.endsWith("_CREDITO")) return "CREDITO";
  if (block.endsWith("_DEBITO")) return "DEBITO";
  return null;
}

/** Colunas ignoradas das abas mensais (bloco "Outros Débito", repetido de 2025). */
export const IGNORED_COLS = { from: 16, to: 18 }; // P–R

/** Faixa aceita para datas de lançamentos. */
export const DATE_MIN = Date.UTC(2024, 0, 1);
export const DATE_MAX = Date.UTC(2027, 11, 31);

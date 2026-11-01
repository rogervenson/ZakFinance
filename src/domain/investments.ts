// Regras da carteira: preço médio, venda, valor e rentabilidade (centavos).

export type AssetKind = "ACAO" | "FII" | "ETF";
export const KIND_LABEL: Record<AssetKind, string> = { ACAO: "Ações", FII: "FIIs", ETF: "ETF" };

export interface Position {
  quantity: number;
  avgPriceCents: number;
}

export interface Trade {
  quantity: number;
  priceCents: number;
  feesCents: number;
}

/** Compra: o preço médio passa a incluir a nova compra e as taxas. */
export function applyBuy(pos: Position, t: Trade): Position {
  const quantity = pos.quantity + t.quantity;
  const cost = pos.quantity * pos.avgPriceCents + t.quantity * t.priceCents + t.feesCents;
  return { quantity, avgPriceCents: Math.round(cost / quantity) };
}

/** Venda: o preço médio não muda; o lucro realizado é (preço − PM) × qtd − taxas. */
export function applySell(pos: Position, t: Trade): Position & { realizedCents: number } {
  if (t.quantity > pos.quantity) throw new Error(`Venda maior que a posição: você só tem ${pos.quantity}.`);
  const quantity = pos.quantity - t.quantity;
  return {
    quantity,
    avgPriceCents: quantity === 0 ? 0 : pos.avgPriceCents,
    realizedCents: t.quantity * (t.priceCents - pos.avgPriceCents) - t.feesCents,
  };
}

export interface HoldingInput {
  ticker: string;
  kind: AssetKind;
  quantity: number;
  avgPriceCents: number;
  dividendsCents: number;
}

export interface HoldingView extends HoldingInput {
  priceCents: number;
  quoteMissing: boolean;
  investedCents: number;
  valueCents: number;
  gainCents: number;
  gainPct: number | null;
  /** (valor + proventos − investido) / investido. */
  totalReturnPct: number | null;
}

/** Valor e rentabilidade de uma posição; sem cotação, usa o preço médio. */
export function holdingView(h: HoldingInput, priceCents: number | null): HoldingView {
  const price = priceCents ?? h.avgPriceCents;
  const investedCents = h.quantity * h.avgPriceCents;
  const valueCents = h.quantity * price;
  const gainCents = valueCents - investedCents;
  return {
    ...h,
    priceCents: price,
    quoteMissing: priceCents === null,
    investedCents,
    valueCents,
    gainCents,
    gainPct: investedCents > 0 ? gainCents / investedCents : null,
    totalReturnPct: investedCents > 0 ? (valueCents + h.dividendsCents - investedCents) / investedCents : null,
  };
}

interface Totals {
  investedCents: number;
  valueCents: number;
  gainCents: number;
  dividendsCents: number;
}

const sum = (list: HoldingView[]): Totals => ({
  investedCents: list.reduce((s, h) => s + h.investedCents, 0),
  valueCents: list.reduce((s, h) => s + h.valueCents, 0),
  gainCents: list.reduce((s, h) => s + h.gainCents, 0),
  dividendsCents: list.reduce((s, h) => s + h.dividendsCents, 0),
});

export function portfolioTotals(list: HoldingView[]): Totals & { byKind: Record<AssetKind, Totals> } {
  return {
    ...sum(list),
    byKind: {
      ACAO: sum(list.filter((h) => h.kind === "ACAO")),
      FII: sum(list.filter((h) => h.kind === "FII")),
      ETF: sum(list.filter((h) => h.kind === "ETF")),
    },
  };
}

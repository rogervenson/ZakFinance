// Cotações (Yahoo Finance, sem chave): símbolos e leitura da resposta.

/** "BBAS3" → "BBAS3.SA"; "USDBRL" → "BRL=X". */
export function yahooSymbol(ticker: string): string {
  if (ticker === "USDBRL") return "BRL=X";
  return `${ticker}.SA`;
}

/** Preço (centavos) e variação do dia a partir de /v8/finance/chart. */
export function parseYahooChart(json: unknown): { priceCents: number; changePct: number | null } | null {
  const meta = (json as { chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number } }[] | null } })?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  const prev = meta?.chartPreviousClose;
  return { priceCents: Math.round(price * 100), changePct: typeof prev === "number" && prev > 0 ? (price - prev) / prev : null };
}

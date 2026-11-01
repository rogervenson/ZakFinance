import "server-only";
import { db } from "@/server/db";
import { parseYahooChart, yahooSymbol } from "@/domain/quotes";

export type QuoteFetcher = (symbol: string) => Promise<{ priceCents: number; changePct: number | null } | null>;

/** Busca no Yahoo Finance (sem chave). Qualquer falha devolve null. */
export const yahooFetcher: QuoteFetcher = async (symbol) => {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0 ZakFinance" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return parseYahooChart(await res.json());
  } catch {
    return null;
  }
};

const MAX_AGE_MS = 6 * 3_600_000;

/**
 * Atualiza as cotações dos ativos da carteira e do dólar. Sem `force`, só se a
 * mais antiga tiver mais de 6 horas. Se a fonte falhar, fica a última cotação.
 */
export async function refreshQuotes(options: { force?: boolean; fetcher?: QuoteFetcher } = {}): Promise<{ updated: number; failed: string[] }> {
  const fetcher = options.fetcher ?? yahooFetcher;
  const holdings = await db.holding.findMany({ where: { quantity: { gt: 0 } }, select: { ticker: true } });
  const tickers = [...holdings.map((h) => h.ticker), "USDBRL"];
  if (!options.force) {
    const quotes = await db.quote.findMany({ where: { ticker: { in: tickers } } });
    const fresh = quotes.length === tickers.length && quotes.every((q) => Date.now() - q.fetchedAt.getTime() < MAX_AGE_MS);
    if (fresh) return { updated: 0, failed: [] };
  }
  const results = await Promise.all(tickers.map(async (t) => [t, await fetcher(yahooSymbol(t))] as const));
  const failed: string[] = [];
  let updated = 0;
  for (const [ticker, q] of results) {
    if (!q) {
      failed.push(ticker);
      continue;
    }
    await db.quote.upsert({
      where: { ticker },
      update: { priceCents: q.priceCents, changePct: q.changePct, fetchedAt: new Date() },
      create: { ticker, priceCents: q.priceCents, changePct: q.changePct, fetchedAt: new Date() },
    });
    updated++;
  }
  return { updated, failed };
}

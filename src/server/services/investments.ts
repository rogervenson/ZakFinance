import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { applyBuy, applySell, holdingView, portfolioTotals, type AssetKind } from "@/domain/investments";
import { monthKey } from "@/lib/months";
import { parseBRL } from "@/lib/money";
import { money, requiredDate } from "@/lib/validation/common";
import { AppError, notFound, parseInput } from "@/server/errors";
import { refreshQuotes } from "./quotes";

export const ASSET_CLASSES = ["Poupança", "Fundos", "Ações", "FIIs", "ETF", "Previdência"] as const;

const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}\d{1,2}$/, "Código inválido (ex.: BBAS3, KNCR11).");

const operationSchema = z.object({
  ticker: tickerSchema,
  kind: z.enum(["ACAO", "FII", "ETF"]).optional(),
  type: z.enum(["BUY", "SELL"]),
  date: requiredDate(),
  quantity: z.coerce.number({ error: "Quantidade inválida." }).int("Quantidade inteira.").positive("Quantidade inválida."),
  price: money("Preço"),
  fees: z
    .string()
    .optional()
    .transform((x, ctx) => {
      if (!x || !x.trim() || /^0+([.,]0+)?$/.test(x.trim())) return 0;
      const c = parseBRL(x);
      if (c === null) {
        ctx.addIssue({ code: "custom", message: "Taxas inválidas." });
        return z.NEVER;
      }
      return c;
    }),
  note: z.string().trim().max(200).optional(),
});

/** Registra compra ou venda e atualiza a posição. */
export async function recordOperation(raw: unknown) {
  const v = parseInput(operationSchema, raw);
  return db.$transaction(async (tx) => {
    const h = await tx.holding.findUnique({ where: { ticker: v.ticker } });
    const pos = { quantity: h?.quantity ?? 0, avgPriceCents: h?.avgPriceCents ?? 0 };
    const trade = { quantity: v.quantity, priceCents: v.price, feesCents: v.fees };
    let next: { quantity: number; avgPriceCents: number; realizedCents?: number };
    try {
      next = v.type === "BUY" ? applyBuy(pos, trade) : applySell(pos, trade);
    } catch (e) {
      throw new AppError("VALIDATION", e instanceof Error ? e.message : "Operação inválida.");
    }
    const kind = (h?.kind as AssetKind | undefined) ?? v.kind ?? (/11$/.test(v.ticker) ? "FII" : "ACAO");
    if (h) {
      await tx.holding.update({
        where: { ticker: v.ticker },
        data: { quantity: next.quantity, avgPriceCents: next.avgPriceCents, realizedCents: h.realizedCents + (next.realizedCents ?? 0), asOf: v.date, source: "MANUAL" },
      });
    } else {
      await tx.holding.create({ data: { ticker: v.ticker, kind, quantity: next.quantity, avgPriceCents: next.avgPriceCents, asOf: v.date } });
    }
    return tx.investmentOperation.create({
      data: {
        ticker: v.ticker,
        kind,
        type: v.type,
        date: v.date,
        quantity: v.quantity,
        priceCents: v.price,
        feesCents: v.fees,
        realizedCents: v.type === "SELL" ? next.realizedCents! : null,
        prevQuantity: pos.quantity,
        prevAvgPriceCents: pos.avgPriceCents,
        note: v.note || null,
      },
    });
  });
}

/** Desfaz a última operação de um ativo (volta a posição de antes). */
export async function deleteOperation(id: string) {
  return db.$transaction(async (tx) => {
    const op = await tx.investmentOperation.findUnique({ where: { id } });
    if (!op) throw notFound("Operação");
    const last = await tx.investmentOperation.findFirst({ where: { ticker: op.ticker }, orderBy: { createdAt: "desc" } });
    if (last?.id !== op.id) throw new AppError("VALIDATION", "Só dá para desfazer a última operação deste ativo.");
    const h = await tx.holding.findUniqueOrThrow({ where: { ticker: op.ticker } });
    await tx.holding.update({
      where: { ticker: op.ticker },
      data: { quantity: op.prevQuantity, avgPriceCents: op.prevAvgPriceCents, realizedCents: h.realizedCents - (op.realizedCents ?? 0) },
    });
    await tx.investmentOperation.delete({ where: { id } });
  });
}

const dividendSchema = z.object({
  ticker: tickerSchema,
  date: requiredDate(),
  amount: money(),
  accountId: z.string().min(1, "Escolha a conta onde o dinheiro entrou."),
});

/** Provento (dividendo, JCP, rendimento de FII): receita em Dividendos ligada ao ativo. */
export async function recordDividend(raw: unknown) {
  const v = parseInput(dividendSchema, raw);
  const category = await db.category.upsert({
    where: { name_kind: { name: "Dividendos", kind: "INCOME" } },
    update: {},
    create: { name: "Dividendos", kind: "INCOME", countsInCostOfLiving: false },
  });
  return db.transaction.create({
    data: { type: "INCOME", date: v.date, month: monthKey(v.date), description: `Proventos ${v.ticker}`, amountCents: v.amount, accountId: v.accountId, categoryId: category.id, ticker: v.ticker },
  });
}

/** Carteira com cotações, valores e totais. Atualiza as cotações se estiverem velhas. */
export async function getPortfolio(options: { refresh?: boolean } = {}) {
  let quoteError: string[] = [];
  if (options.refresh !== false) quoteError = (await refreshQuotes()).failed;
  const [holdings, quotes, dividends, operations] = await Promise.all([
    db.holding.findMany({ orderBy: { ticker: "asc" } }),
    db.quote.findMany(),
    db.transaction.groupBy({ by: ["ticker"], where: { ticker: { not: null }, type: "INCOME" }, _sum: { amountCents: true } }),
    db.investmentOperation.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 50 }),
  ]);
  const quoteBy = new Map(quotes.map((q) => [q.ticker, q]));
  const divBy = new Map(dividends.map((d) => [d.ticker!, d._sum.amountCents ?? 0]));
  const views = holdings
    .filter((h) => h.quantity > 0)
    .map((h) => ({
      ...holdingView(
        { ticker: h.ticker, kind: h.kind as AssetKind, quantity: h.quantity, avgPriceCents: h.avgPriceCents, dividendsCents: h.dividendsTotalCents + (divBy.get(h.ticker) ?? 0) },
        quoteBy.get(h.ticker)?.priceCents ?? null,
      ),
      changePct: quoteBy.get(h.ticker)?.changePct ?? null,
      realizedCents: h.realizedCents,
    }));
  const lastFetch = quotes.reduce<Date | null>((m, q) => (!m || q.fetchedAt > m ? q.fetchedAt : m), null);
  return {
    holdings: views,
    totals: portfolioTotals(views),
    realizedCents: holdings.reduce((s, h) => s + h.realizedCents, 0),
    usdCents: quoteBy.get("USDBRL")?.priceCents ?? null,
    lastFetch,
    quoteError,
    operations,
  };
}

/**
 * Patrimônio por mês: valores por classe e total. Classe sem valor no mês entra com o
 * último valor conhecido (listada em `carried`), para o total não despencar.
 */
export async function listSnapshots() {
  const rows = await db.assetSnapshot.findMany({ orderBy: { month: "asc" } });
  const byMonth = new Map<string, Record<string, number>>();
  for (const r of rows) byMonth.set(r.month, { ...(byMonth.get(r.month) ?? {}), [r.assetClass]: r.valueCents });
  const lastKnown: Record<string, number> = {};
  return [...byMonth.entries()].map(([month, own]) => {
    const carried = Object.keys(lastKnown).filter((c) => own[c] === undefined);
    const values = { ...lastKnown, ...own };
    Object.assign(lastKnown, own);
    return { month, values, carried, totalCents: Object.values(values).reduce((s, v) => s + v, 0) };
  });
}

const snapshotSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido."),
  values: z.record(z.string(), z.string()),
});

/** Grava os valores do mês (classes deixadas em branco não mudam). */
export async function saveSnapshotMonth(raw: unknown) {
  const v = parseInput(snapshotSchema, raw);
  for (const [assetClass, text] of Object.entries(v.values)) {
    if (!(ASSET_CLASSES as readonly string[]).includes(assetClass)) continue;
    if (!text.trim()) continue;
    const cents = /^0+([.,]0+)?$/.test(text.trim()) ? 0 : parseBRL(text);
    if (cents === null) throw new AppError("VALIDATION", `Valor inválido para ${assetClass}.`);
    await db.assetSnapshot.upsert({
      where: { month_assetClass: { month: v.month, assetClass } },
      update: { valueCents: cents, source: "MANUAL" },
      create: { month: v.month, assetClass, valueCents: cents, source: "MANUAL" },
    });
  }
}

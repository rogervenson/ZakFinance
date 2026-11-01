import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { ACCOUNT, DEFAULT_PROJECTS } from "@/domain/defaults";
import { invoiceDates, invoiceMonthFor } from "@/domain/invoices";
import { parseZak26, type ZakIssue, type ZakParse } from "@/domain/zak26/parse";
import { balanceAt, planZakImport, simulateChecking, type PlanContext, type PlannedTx } from "@/domain/zak26/plan";
import { detectSeries, type SeriesCandidate } from "@/domain/zak26/series";
import { addMonthKey, currentMonthKey } from "@/lib/months";
import { today } from "@/lib/dates";
import { readWorkbook } from "@/server/import/xlsx-grid";
import { AppError } from "@/server/errors";
import type { Prisma } from "@/generated/prisma/client";

/** A planilha é de 2026. */
const ZAK26_YEAR = 2026;
const lastMonthFor = (now: string) => (now < `${ZAK26_YEAR}-12` ? now : `${ZAK26_YEAR}-12`);

export interface ZakPreview {
  sha256: string;
  months: { month: string; incomeCents: number; expenseCents: number; creditCents: number; debitCents: number; rowCount: number }[];
  issues: ZakIssue[];
  series: SeriesCandidate[];
  alreadyImported: number;
  totalPlanned: number;
  checkingOpeningCents: number;
  balanceCheck: { month: string; geralCents: number; computedCents: number }[];
  snapshots: number;
  holdings: number;
}

async function buildContext(currentMonth: string): Promise<PlanContext> {
  const [accounts, categories, projects] = await Promise.all([db.account.findMany(), db.category.findMany(), db.project.findMany()]);
  const acc = (name: string) => {
    const a = accounts.find((x) => x.name === name);
    if (!a) throw new AppError("VALIDATION", `Conta "${name}" não encontrada. Rode o seed (npm run setup).`);
    return a;
  };
  const card = acc(ACCOUNT.card);
  const project = (name: string) => {
    const p = projects.find((x) => x.name === name);
    if (!p) throw new AppError("VALIDATION", `Projeto "${name}" não encontrado.`);
    return p.id;
  };
  return {
    accounts: { checking: acc(ACCOUNT.checking).id, card: card.id, savings: acc(ACCOUNT.savings).id, broker: acc(ACCOUNT.broker).id, ticket: acc(ACCOUNT.ticket).id },
    card: { closingDay: card.closingDay ?? 12, dueDay: card.dueDay ?? 20 },
    categories: (kind, name) => {
      const c = categories.find((x) => x.kind === kind && x.name === name);
      if (!c) throw new AppError("VALIDATION", `Categoria "${name}" não encontrada.`);
      return c.id;
    },
    projects: { Sótão: project(DEFAULT_PROJECTS[0]), Agro: project(DEFAULT_PROJECTS[1]) },
    currentMonth,
  };
}

async function load(file: Buffer, currentMonth: string) {
  let sheets;
  try {
    sheets = await readWorkbook(file);
  } catch {
    throw new AppError("VALIDATION", "Não foi possível ler o arquivo. Envie a planilha em .xlsx.");
  }
  if (!sheets.some((s) => s.name === "Geral")) throw new AppError("VALIDATION", "Esta planilha não parece a Zak26 (falta a aba Geral).");
  const parse = parseZak26(sheets, { year: ZAK26_YEAR, lastMonth: lastMonthFor(currentMonth) });
  const ctx = await buildContext(currentMonth);
  const plan = planZakImport(parse, ctx);
  return { parse, ctx, plan, sha256: createHash("sha256").update(file).digest("hex") };
}

function summarize(parse: ZakParse, plan: PlannedTx[], ctx: PlanContext, sha256: string, alreadyImported: number): ZakPreview {
  const months = new Map<string, ZakPreview["months"][number]>();
  const get = (m: string) => months.get(m) ?? months.set(m, { month: m, incomeCents: 0, expenseCents: 0, creditCents: 0, debitCents: 0, rowCount: 0 }).get(m)!;
  for (const r of parse.rows) get(r.month).rowCount++;
  for (const t of plan) {
    if (t.accountId === ctx.accounts.ticket) continue;
    const m = get(t.month);
    if (t.type === "INCOME") m.incomeCents += t.amountCents;
    if (t.type === "EXPENSE") {
      m.expenseCents += t.amountCents;
      if (t.invoiceMonth) m.creditCents += t.amountCents;
      else m.debitCents += t.amountCents;
    }
  }
  const simulated = simulateChecking(plan, parse.checkingOpeningCents, ctx.accounts.checking);
  return {
    sha256,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    issues: parse.issues,
    series: detectSeries(parse.rows),
    alreadyImported,
    totalPlanned: plan.length,
    checkingOpeningCents: parse.checkingOpeningCents,
    balanceCheck: parse.geralBalances.map((b) => ({ month: b.month, geralCents: b.cents, computedCents: balanceAt(simulated, b.month, parse.checkingOpeningCents) })),
    snapshots: parse.snapshots.length,
    holdings: parse.holdings.length,
  };
}

async function countExisting(plan: PlannedTx[]) {
  const keys = plan.map((p) => p.importKey);
  const existing = await db.transaction.findMany({ where: { importKey: { in: keys } }, select: { importKey: true } });
  return new Set(existing.map((e) => e.importKey!));
}

/** Lê a planilha e mostra o que seria importado. Não grava nada. */
export async function previewZakImport(file: Buffer, currentMonth: string = currentMonthKey()): Promise<ZakPreview> {
  const { parse, ctx, plan, sha256 } = await load(file, currentMonth);
  const existing = await countExisting(plan);
  return summarize(parse, plan, ctx, sha256, existing.size);
}

/** Grava a importação. Linhas já importadas (mesma chave) são puladas. */
export async function confirmZakImport(file: Buffer, currentMonth: string = currentMonthKey()): Promise<{ created: number; skipped: number }> {
  const { parse, ctx, plan, sha256 } = await load(file, currentMonth);
  const existing = await countExisting(plan);
  const todo = plan.filter((p) => !existing.has(p.importKey));
  const report = summarize(parse, plan, ctx, sha256, existing.size);

  await db.$transaction(
    async (tx) => {
      // Faturas do cartão por mês.
      const invoiceMonths = [...new Set(plan.flatMap((p) => [p.invoiceMonth, p.paysInvoiceMonth]).filter((m): m is string => !!m))];
      const invoiceId = new Map<string, string>();
      for (const month of invoiceMonths) {
        const { closingDate, dueDate } = invoiceDates(month, ctx.card.closingDay, ctx.card.dueDay);
        const inv = await tx.invoice.upsert({
          where: { accountId_month: { accountId: ctx.accounts.card, month } },
          update: {},
          create: { accountId: ctx.accounts.card, month, closingDate, dueDate },
        });
        invoiceId.set(month, inv.id);
      }

      const data: Prisma.TransactionCreateManyInput[] = [];
      for (const p of todo) {
        if (p.paysInvoiceMonth) {
          const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId.get(p.paysInvoiceMonth)! }, include: { payment: true } });
          if (inv.payment) continue; // já paga manualmente
        }
        data.push({
          type: p.type,
          date: p.date,
          month: p.month,
          description: p.description,
          amountCents: p.amountCents,
          accountId: p.accountId,
          toAccountId: p.toAccountId,
          categoryId: p.categoryId,
          projectId: p.projectId,
          invoiceId: p.invoiceMonth ? invoiceId.get(p.invoiceMonth)! : null,
          paysInvoiceId: p.paysInvoiceMonth ? invoiceId.get(p.paysInvoiceMonth)! : null,
          reimbursable: p.reimbursable,
          reimbursementStatus: p.reimbursementStatus,
          source: "ZAK26",
          importKey: p.importKey,
        });
      }
      if (data.length) await tx.transaction.createMany({ data });

      for (const p of todo.filter((x) => x.paysInvoiceMonth)) {
        await tx.invoice.updateMany({ where: { id: invoiceId.get(p.paysInvoiceMonth!)!, status: { not: "PAID" } }, data: { status: "PAID", paidAt: p.date } });
      }

      await tx.account.update({ where: { id: ctx.accounts.checking }, data: { openingBalanceCents: parse.checkingOpeningCents, openingDate: new Date(`${ZAK26_YEAR}-01-01T00:00:00.000Z`) } });

      for (const s of parse.snapshots) {
        const cur = await tx.assetSnapshot.findUnique({ where: { month_assetClass: { month: s.month, assetClass: s.assetClass } } });
        if (cur && cur.source === "MANUAL") continue;
        await tx.assetSnapshot.upsert({
          where: { month_assetClass: { month: s.month, assetClass: s.assetClass } },
          update: { valueCents: s.cents },
          create: { month: s.month, assetClass: s.assetClass, valueCents: s.cents, source: "ZAK26" },
        });
      }
      for (const h of parse.holdings) {
        const cur = await tx.holding.findUnique({ where: { ticker: h.ticker } });
        if (cur && cur.source === "MANUAL") continue;
        const data = { kind: h.kind, quantity: h.quantity, avgPriceCents: h.avgPriceCents, dividendsTotalCents: h.dividendsTotalCents, asOf: today(), source: "ZAK26" as const };
        await tx.holding.upsert({ where: { ticker: h.ticker }, update: data, create: { ticker: h.ticker, ...data } });
      }

      await tx.importRun.create({
        data: {
          kind: "ZAK26",
          fileSha256: sha256,
          report: JSON.parse(JSON.stringify(report)),
          raw: JSON.parse(JSON.stringify({ inv: parse.rawInv, geral: parse.rawGeral })),
        },
      });
    },
    { timeout: 120_000 },
  );
  return { created: todo.length, skipped: existing.size };
}

/**
 * Compras parceladas ainda não confirmadas: recalculadas a partir das compras no
 * cartão vindas da planilha que ainda não pertencem a nenhum parcelamento.
 */
export async function listPendingSeries(): Promise<SeriesCandidate[]> {
  const rows = await db.transaction.findMany({
    where: { source: "ZAK26", type: "EXPENSE", invoiceId: { not: null }, installmentPlanId: null, importKey: { startsWith: "ZAK26:" } },
    select: { importKey: true, month: true, description: true, amountCents: true, date: true },
  });
  return detectSeries(
    rows
      .filter((r) => /^ZAK26:[^:]+:B\d+$/.test(r.importKey!))
      .map((r) => ({
        importKey: r.importKey!,
        row: Number(r.importKey!.split(":B")[1]),
        month: r.month,
        description: r.description,
        cents: r.amountCents,
        date: r.date,
        dateIssue: false,
        payment: "CREDITO" as const,
      })),
  );
}

const monthDiff = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5)) - Number(a.slice(5));

/**
 * Transforma uma série detectada em parcelamento: numera as linhas importadas pela
 * distância da 1ª fatura da compra e cria as parcelas que faltam nas próximas faturas.
 */
export async function confirmSeries(seriesKey: string, totalCount: number) {
  if (!Number.isInteger(totalCount) || totalCount < 2 || totalCount > 48) throw new AppError("VALIDATION", "Informe o total de parcelas (2 a 48).");
  const series = (await listPendingSeries()).find((s) => s.key === seriesKey);
  if (!series) throw new AppError("NOT_FOUND", "Série não encontrada ou já confirmada.");
  const card = await db.account.findUniqueOrThrow({ where: { name: ACCOUNT.card } });
  const firstMonth = invoiceMonthFor(series.purchaseDate, card.closingDay ?? 12, card.dueDay ?? 20);
  const rows = await db.transaction.findMany({ where: { importKey: { in: series.importKeys } }, orderBy: { month: "asc" } });
  const numbered = rows.map((r) => ({ row: r, n: monthDiff(firstMonth, r.month) + 1 }));
  const maxImported = Math.max(...numbered.map((x) => x.n));
  if (maxImported > totalCount || numbered.some((x) => x.n < 1)) {
    throw new AppError("VALIDATION", `Pela data da compra, já há parcelas até a ${maxImported}ª: o total deve ser pelo menos ${maxImported}.`);
  }
  const lastMonth = rows[rows.length - 1].month;

  await db.$transaction(async (tx) => {
    const first = rows[0];
    const plan = await tx.installmentPlan.create({
      data: {
        description: series.description,
        installmentCents: series.installmentCents,
        count: totalCount,
        firstInvoiceMonth: firstMonth,
        purchaseDate: series.purchaseDate,
        accountId: card.id,
        categoryId: first.categoryId!,
        projectId: first.projectId,
        source: "ZAK26",
      },
    });
    for (const { row, n } of numbered) await tx.transaction.update({ where: { id: row.id }, data: { installmentPlanId: plan.id, installmentNumber: n } });
    for (let n = maxImported + 1; n <= totalCount; n++) {
      const month = addMonthKey(firstMonth, n - 1);
      if (month <= lastMonth) continue;
      const { closingDate, dueDate } = invoiceDates(month, card.closingDay ?? 12, card.dueDay ?? 20);
      const invoice = await tx.invoice.upsert({ where: { accountId_month: { accountId: card.id, month } }, update: {}, create: { accountId: card.id, month, closingDate, dueDate } });
      if (invoice.status === "PAID") throw new AppError("VALIDATION", `A fatura de ${month} já está paga; não dá para incluir a parcela ${n}.`);
      await tx.transaction.create({
        data: {
          type: "EXPENSE",
          date: series.purchaseDate,
          month,
          description: `${series.description} (${n}/${totalCount})`,
          amountCents: series.installmentCents,
          accountId: card.id,
          categoryId: first.categoryId,
          projectId: first.projectId,
          invoiceId: invoice.id,
          installmentPlanId: plan.id,
          installmentNumber: n,
          source: "ZAK26",
          importKey: `ZAK26:parcela:${plan.id}:${n}`,
        },
      });
    }
  });
}

/** Remove tudo o que veio da Zak26. Lançamentos manuais ficam. */
export async function undoZakImport() {
  await db.$transaction(
    async (tx) => {
      const payments = await tx.transaction.findMany({ where: { source: "ZAK26", paysInvoiceId: { not: null } }, select: { paysInvoiceId: true } });
      await tx.transaction.deleteMany({ where: { source: "ZAK26" } });
      await tx.installmentPlan.deleteMany({ where: { source: "ZAK26", transactions: { none: {} } } });
      await tx.invoice.updateMany({ where: { id: { in: payments.map((p) => p.paysInvoiceId!) } }, data: { status: "OPEN", paidAt: null } });
      await tx.invoice.deleteMany({ where: { items: { none: {} }, payment: null } });
      await tx.assetSnapshot.deleteMany({ where: { source: "ZAK26" } });
      await tx.holding.deleteMany({ where: { source: "ZAK26" } });
      await tx.importRun.deleteMany({ where: { kind: "ZAK26" } });
      const checking = await tx.account.findUnique({ where: { name: ACCOUNT.checking } });
      if (checking) await tx.account.update({ where: { id: checking.id }, data: { openingBalanceCents: 0 } });
    },
    { timeout: 120_000 },
  );
}


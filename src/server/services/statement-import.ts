import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { ACCOUNT, ADJUSTMENT_CATEGORY } from "@/domain/defaults";
import { invoiceDates } from "@/domain/invoices";
import { pickSuggestion, normalizeDescription } from "@/domain/suggest";
import { detectStatementKind, type StatementKind } from "@/domain/statements/detect";
import { parseSantanderAccount, type AccountStatement } from "@/domain/statements/santander-account";
import { parseSantanderCard, type CardInvoice } from "@/domain/statements/santander-card";
import { classifyAccountLine, cleanDescription } from "@/domain/statements/classify";
import { matchLines, type ExistingTx } from "@/domain/statements/match";
import { addMonthKey, monthEnd, monthKey, monthLabel, monthStart } from "@/lib/months";
import { toDateInput } from "@/lib/dates";
import { centsToInput } from "@/lib/format";
import { AppError, parseInput } from "@/server/errors";
import { accountBalance } from "./accounts";
import { ensureInvoice, invoiceTotal } from "./invoices";
import { createTransaction } from "./transactions";

export type RowStatus = "NEW" | "MATCHED" | "IMPORTED";

export interface PreviewRow {
  key: string;
  date: string;
  description: string;
  /** Com sinal, do ponto de vista da conta do documento. */
  amountCents: number;
  status: RowStatus;
  matchedDescription: string | null;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  categoryId: string | null;
  toAccountId: string | null;
  installment: string | null;
  cardholder: string | null;
}

export interface StatementPreview {
  kind: StatementKind;
  title: string;
  month: string;
  accountId: string;
  accountName: string;
  rows: PreviewRow[];
  issues: string[];
  /** Conta: saldo final do extrato × sistema; cartão: total da fatura × sistema. */
  check: { label: string; documentCents: number; systemCents: number; afterImportCents: number };
  snapshots: { assetClass: string; cents: number }[];
}

async function context() {
  const [accounts, categories, history] = await Promise.all([
    db.account.findMany(),
    db.category.findMany({ where: { archivedAt: null } }),
    db.transaction.findMany({
      where: { type: { in: ["EXPENSE", "INCOME"] }, categoryId: { not: null } },
      select: { description: true, categoryId: true, accountId: true, projectId: true, date: true },
      orderBy: { date: "desc" },
      take: 4000,
    }),
  ]);
  const acc = (name: string) => {
    const a = accounts.find((x) => x.name === name);
    if (!a) throw new AppError("VALIDATION", `Conta "${name}" não encontrada.`);
    return a;
  };
  const catId = (kind: "EXPENSE" | "INCOME", name: string | null) => (name ? (categories.find((c) => c.kind === kind && c.name === name)?.id ?? null) : null);
  const suggest = (description: string, kind: "EXPENSE" | "INCOME") => {
    const s = pickSuggestion(history, description);
    if (!s) return null;
    return categories.find((c) => c.id === s.categoryId && c.kind === kind)?.id ?? null;
  };
  return { acc, catId, suggest };
}

/** Chave estável da linha: tipo, data, valor, descrição e ordem entre iguais. */
function keyer(prefix: string) {
  const seen = new Map<string, number>();
  return (date: Date, cents: number, description: string) => {
    const base = `${prefix}:${toDateInput(date)}:${cents}:${normalizeDescription(description).slice(0, 40)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}:${n}`;
  };
}

async function existingKeys(keys: string[]) {
  const rows = await db.transaction.findMany({ where: { importKey: { in: keys } }, select: { importKey: true } });
  return new Set(rows.map((r) => r.importKey!));
}

// ───────────────────────────── Conta corrente ─────────────────────────────

async function previewAccount(s: AccountStatement): Promise<StatementPreview> {
  const ctx = await context();
  const checking = ctx.acc(ACCOUNT.checking);
  const savings = ctx.acc(ACCOUNT.savings);
  const card = ctx.acc(ACCOUNT.card);
  const key = keyer("EXT:CC");
  const lines = s.lines.map((l) => ({ ...l, description: cleanDescription(l.description), key: "" }));
  for (const l of lines) l.key = key(l.date, l.amountCents, l.description);

  const from = monthStart(addMonthKey(s.month, 0));
  const existing = await db.transaction.findMany({
    where: {
      OR: [{ accountId: checking.id }, { toAccountId: checking.id }],
      date: { gte: new Date(from.getTime() - 7 * 86_400_000), lte: new Date(monthEnd(s.month).getTime() + 7 * 86_400_000) },
    },
  });
  const ex: ExistingTx[] = existing.map((t) => ({
    id: t.id,
    date: t.date,
    amountCents: t.toAccountId === checking.id ? t.amountCents : t.type === "INCOME" ? t.amountCents : -t.amountCents,
    description: t.description,
    invoiceMonth: null,
  }));
  const imported = await existingKeys(lines.map((l) => l.key));
  const fresh = lines.filter((l) => !imported.has(l.key));
  const matches = matchLines(
    fresh.map((l) => ({ key: l.key, date: l.date, amountCents: l.amountCents, description: l.description, invoiceMonth: null })),
    ex,
    { maxDays: 5 },
  );
  const byId = new Map(existing.map((t) => [t.id, t]));

  const rows: PreviewRow[] = lines.map((l) => {
    const c = classifyAccountLine(l.description, l.amountCents, s.savingsAccount);
    const kind = c.type === "INCOME" ? "INCOME" : "EXPENSE";
    const matched = matches.get(l.key);
    return {
      key: l.key,
      date: toDateInput(l.date),
      description: l.description,
      amountCents: l.amountCents,
      status: imported.has(l.key) ? "IMPORTED" : matched ? "MATCHED" : "NEW",
      matchedDescription: matched ? (byId.get(matched)?.description ?? null) : null,
      type: c.type,
      categoryId: c.type === "TRANSFER" ? null : (ctx.catId(kind, c.category) ?? ctx.suggest(l.description, kind)),
      toAccountId: c.to === "savings" ? savings.id : c.to === "card" ? card.id : null,
      installment: null,
      cardholder: null,
    };
  });

  const systemCents = await accountBalance(checking.id, monthEnd(s.month));
  const newSum = rows.filter((r) => r.status === "NEW").reduce((sum, r) => sum + r.amountCents, 0);
  const snapshots = [
    ...(s.savingsCents !== null ? [{ assetClass: "Poupança", cents: s.savingsCents }] : []),
    ...(s.fundCents !== null ? [{ assetClass: "Fundos", cents: s.fundCents }] : []),
  ];
  return {
    kind: "SANTANDER_ACCOUNT",
    title: `Extrato da conta — ${monthLabel(s.month)}`,
    month: s.month,
    accountId: checking.id,
    accountName: checking.name,
    rows,
    issues: s.issues.map((i) => i.message),
    check: { label: `Saldo em ${toDateInput(monthEnd(s.month)).split("-").reverse().join("/")}`, documentCents: s.closingCents, systemCents, afterImportCents: systemCents + newSum },
    snapshots,
  };
}

// ───────────────────────────── Cartão ─────────────────────────────

async function previewCard(f: CardInvoice): Promise<StatementPreview> {
  const ctx = await context();
  const card = ctx.acc(ACCOUNT.card);
  const key = keyer(`EXT:CARD:${f.month}`);
  const lines = f.lines.map((l) => ({ ...l, key: key(l.date, l.amountCents, l.description) }));
  const invoice = await db.invoice.findUnique({ where: { accountId_month: { accountId: card.id, month: f.month } } });
  const existing = invoice ? await db.transaction.findMany({ where: { invoiceId: invoice.id, type: { not: "TRANSFER" } } }) : [];
  const ex: ExistingTx[] = existing.map((t) => ({ id: t.id, date: t.date, amountCents: t.type === "INCOME" ? -t.amountCents : t.amountCents, description: t.description, invoiceMonth: f.month }));
  const imported = await existingKeys(lines.map((l) => l.key));
  const matches = matchLines(
    lines.filter((l) => !imported.has(l.key)).map((l) => ({ key: l.key, date: l.date, amountCents: l.amountCents, description: l.description, invoiceMonth: f.month })),
    ex,
    { maxDays: 5 },
  );
  const byId = new Map(existing.map((t) => [t.id, t]));

  const rows: PreviewRow[] = lines.map((l) => {
    const type = l.amountCents < 0 ? "INCOME" : "EXPENSE";
    const matched = matches.get(l.key);
    return {
      key: l.key,
      date: toDateInput(l.date),
      description: l.description,
      amountCents: l.amountCents,
      status: imported.has(l.key) ? "IMPORTED" : matched ? "MATCHED" : "NEW",
      matchedDescription: matched ? (byId.get(matched)?.description ?? null) : null,
      type,
      categoryId: type === "INCOME" ? ctx.catId("INCOME", "Estorno") : ctx.suggest(l.description, "EXPENSE"),
      toAccountId: null,
      installment: l.installment ? `${l.installment.n}/${l.installment.of}` : null,
      cardholder: l.cardLast4 ? `${l.cardholder.split(" ")[0]} ·${l.cardLast4}` : null,
    };
  });

  const systemCents = invoice ? await invoiceTotal(invoice.id) : 0;
  const newSum = rows.filter((r) => r.status === "NEW").reduce((s, r) => s + r.amountCents, 0);
  return {
    kind: "SANTANDER_CARD",
    title: `Fatura do cartão — vence ${toDateInput(f.dueDate).split("-").reverse().join("/")}`,
    month: f.month,
    accountId: card.id,
    accountName: card.name,
    rows,
    issues: f.issues.map((i) => i.message),
    check: { label: "Total da fatura", documentCents: f.totalCents, systemCents, afterImportCents: systemCents + newSum },
    snapshots: [],
  };
}

// ───────────────────────────── Entrada pública ─────────────────────────────

function parseText(text: string) {
  const kind = detectStatementKind(text);
  if (kind === "SANTANDER_ACCOUNT") return { kind, doc: parseSantanderAccount(text) } as const;
  if (kind === "SANTANDER_CARD") return { kind, doc: parseSantanderCard(text) } as const;
  throw new AppError("VALIDATION", "Não reconheci o documento. Envie o extrato consolidado da conta ou a fatura do cartão do Santander, em PDF.");
}

export async function previewStatementText(text: string): Promise<StatementPreview> {
  const p = parseText(text);
  return p.kind === "SANTANDER_ACCOUNT" ? previewAccount(p.doc) : previewCard(p.doc);
}

const decisionSchema = z.object({
  key: z.string(),
  include: z.boolean(),
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  categoryId: z.string().nullish(),
  toAccountId: z.string().nullish(),
  description: z.string().trim().min(1).max(120),
});
const confirmSchema = z.object({
  decisions: z.array(decisionSchema),
  updateSnapshots: z.boolean().default(false),
  adjustBalance: z.boolean().default(false),
});

/** Grava as linhas escolhidas. Linhas já importadas ou ligadas a lançamentos existentes não são criadas de novo. */
export async function confirmStatementText(text: string, raw: unknown): Promise<{ created: number; plans: number; adjusted: number | null }> {
  const opts = parseInput(confirmSchema, raw);
  const preview = await previewStatementText(text);
  const decisions = new Map(opts.decisions.map((d) => [d.key, d]));
  const chosen = preview.rows.filter((r) => r.status === "NEW" && decisions.get(r.key)?.include);
  let created = 0;
  let plans = 0;

  if (preview.kind === "SANTANDER_CARD") {
    const p = parseText(text);
    const f = p.doc as CardInvoice;
    const byKey = new Map(f.lines.map((l, i) => [preview.rows[i].key, l]));
    await db.$transaction(
      async (tx) => {
        const card = await tx.account.findUniqueOrThrow({ where: { id: preview.accountId } });
        const invoice = await ensureInvoice(tx, card, f.month);
        if (invoice.status === "PAID") throw new AppError("VALIDATION", "Esta fatura já está paga no sistema; lançamentos novos nela não são permitidos.");
        // Datas reais da fatura.
        await tx.invoice.update({ where: { id: invoice.id }, data: { dueDate: f.dueDate, ...(f.closingDate ? { closingDate: f.closingDate } : {}) } });
        for (const row of chosen) {
          const d = decisions.get(row.key)!;
          const line = byKey.get(row.key)!;
          const r = await createCardLine(tx, card, invoice.id, f.month, line, d, row.key);
          created += r.created;
          plans += r.plan ? 1 : 0;
        }
        // Linhas já lançadas que vieram como parcela: liga ao parcelamento (ou cria).
        for (const row of preview.rows.filter((x) => x.status === "MATCHED" && x.installment)) {
          plans += await linkMatchedInstallment(tx, card, f.month, row, byKey.get(row.key)!);
        }
      },
      { timeout: 60_000 },
    );
    return { created, plans, adjusted: null };
  }

  // Conta corrente.
  for (const row of chosen) {
    const d = decisions.get(row.key)!;
    await createAccountLine(preview, row, d);
    created++;
  }
  if (opts.updateSnapshots) {
    for (const s of preview.snapshots) {
      await db.assetSnapshot.upsert({
        where: { month_assetClass: { month: preview.month, assetClass: s.assetClass } },
        update: { valueCents: s.cents, source: "MANUAL" },
        create: { month: preview.month, assetClass: s.assetClass, valueCents: s.cents, source: "MANUAL" },
      });
    }
  }
  let adjusted: number | null = null;
  if (opts.adjustBalance) {
    const end = monthEnd(preview.month);
    const now = await accountBalance(preview.accountId, end);
    const diff = preview.check.documentCents - now;
    if (diff !== 0) {
      const kind = diff > 0 ? "INCOME" : "EXPENSE";
      const category = await db.category.upsert({
        where: { name_kind: { name: ADJUSTMENT_CATEGORY, kind } },
        update: {},
        create: { name: ADJUSTMENT_CATEGORY, kind, countsInCostOfLiving: false },
      });
      await db.transaction.create({
        data: { type: kind, date: end, month: monthKey(end), description: "Ajuste de saldo (extrato)", amountCents: Math.abs(diff), accountId: preview.accountId, categoryId: category.id },
      });
      adjusted = diff;
    }
  }
  return { created, plans, adjusted };
}

async function createAccountLine(preview: StatementPreview, row: PreviewRow, d: z.infer<typeof decisionSchema>) {
  const amount = centsToInput(Math.abs(row.amountCents));
  if (d.type === "TRANSFER") {
    if (!d.toAccountId) throw new AppError("VALIDATION", `Escolha a conta de destino de "${row.description}".`);
    const outgoing = row.amountCents < 0;
    const to = await db.account.findUnique({ where: { id: d.toAccountId } });
    // Débito da fatura do cartão: liga à fatura não paga com o mesmo valor.
    if (outgoing && to?.type === "CREDIT_CARD") {
      const unpaid = await db.invoice.findMany({ where: { accountId: to.id, status: { not: "PAID" }, month: { lte: preview.month } }, orderBy: { month: "desc" } });
      for (const inv of unpaid) {
        if ((await invoiceTotal(inv.id)) === -row.amountCents) {
          await db.$transaction(async (tx) => {
            await tx.transaction.create({
              data: { type: "TRANSFER", date: new Date(`${row.date}T00:00:00.000Z`), month: row.date.slice(0, 7), description: d.description, amountCents: -row.amountCents, accountId: preview.accountId, toAccountId: to.id, paysInvoiceId: inv.id, importKey: row.key },
            });
            await tx.invoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: new Date(`${row.date}T00:00:00.000Z`) } });
          });
          return;
        }
      }
    }
    await createTransaction(
      { type: "TRANSFER", date: row.date, description: d.description, amount, accountId: outgoing ? preview.accountId : d.toAccountId, toAccountId: outgoing ? d.toAccountId : preview.accountId },
      { importKey: row.key },
    );
    return;
  }
  if (!d.categoryId) throw new AppError("VALIDATION", `Escolha a categoria de "${row.description}".`);
  await createTransaction({ type: d.type, date: row.date, description: d.description, amount, accountId: preview.accountId, categoryId: d.categoryId }, { importKey: row.key });
}

type CardLine = CardInvoice["lines"][number];

/** Compra/estorno no cartão, na fatura do documento. Parcela n/N cria o parcelamento com as próximas. */
async function createCardLine(tx: Tx, card: { id: string; closingDay: number | null; dueDay: number | null }, invoiceId: string, month: string, line: CardLine, d: z.infer<typeof decisionSchema>, key: string) {
  const type = line.amountCents < 0 ? "INCOME" : "EXPENSE";
  if (!d.categoryId) throw new AppError("VALIDATION", `Escolha a categoria de "${line.description}".`);
  const base = { date: line.date, description: d.description, accountId: card.id, categoryId: d.categoryId };
  if (type === "INCOME" || !line.installment || line.installment.of <= 1) {
    await tx.transaction.create({ data: { ...base, type, month, amountCents: Math.abs(line.amountCents), invoiceId, importKey: key } });
    return { created: 1, plan: false };
  }
  const { n, of } = line.installment;
  const plan = await findOrCreatePlan(tx, card.id, month, line, d.categoryId, d.description);
  await tx.transaction.create({
    data: { ...base, type, month, amountCents: line.amountCents, invoiceId, importKey: key, installmentPlanId: plan.id, installmentNumber: n, description: `${d.description} (${n}/${of})` },
  });
  const extra = await createFutureInstallments(tx, card, plan.id, month, line, d.categoryId, d.description);
  return { created: 1 + extra, plan: true };
}

async function findOrCreatePlan(tx: Tx, accountId: string, month: string, line: CardLine, categoryId: string, description: string) {
  const { n, of } = line.installment!;
  const firstInvoiceMonth = addMonthKey(month, -(n - 1));
  const existing = await tx.installmentPlan.findFirst({ where: { accountId, count: of, installmentCents: line.amountCents, firstInvoiceMonth } });
  if (existing) return existing;
  return tx.installmentPlan.create({ data: { description, installmentCents: line.amountCents, count: of, firstInvoiceMonth, purchaseDate: line.date, accountId, categoryId } });
}

/** Parcelas seguintes (n+1..N) nas próximas faturas, se ainda não existirem. */
async function createFutureInstallments(tx: Tx, card: { id: string; closingDay: number | null; dueDay: number | null }, planId: string, month: string, line: CardLine, categoryId: string, description: string) {
  const { n, of } = line.installment!;
  let created = 0;
  for (let k = n + 1; k <= of; k++) {
    const m = addMonthKey(month, k - n);
    const exists = await tx.transaction.findFirst({ where: { installmentPlanId: planId, installmentNumber: k } });
    if (exists) continue;
    const { closingDate, dueDate } = invoiceDates(m, card.closingDay ?? 14, card.dueDay ?? 21);
    const inv = await tx.invoice.upsert({ where: { accountId_month: { accountId: card.id, month: m } }, update: {}, create: { accountId: card.id, month: m, closingDate, dueDate } });
    if (inv.status === "PAID") continue;
    await tx.transaction.create({
      data: {
        type: "EXPENSE",
        date: line.date,
        month: m,
        description: `${description} (${k}/${of})`,
        amountCents: line.amountCents,
        accountId: card.id,
        categoryId,
        invoiceId: inv.id,
        installmentPlanId: planId,
        installmentNumber: k,
      },
    });
    created++;
  }
  return created;
}

/** Linha já lançada (ex.: vinda da planilha) que a fatura mostra como parcela n/N. */
async function linkMatchedInstallment(tx: Tx, card: { id: string; closingDay: number | null; dueDay: number | null }, month: string, row: PreviewRow, line: CardLine) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { accountId_month: { accountId: card.id, month } } });
  const target = await tx.transaction.findFirst({ where: { invoiceId: invoice.id, amountCents: line.amountCents, type: "EXPENSE", installmentPlanId: null } });
  if (!target || !target.categoryId || !line.installment || line.installment.of <= 1) return 0;
  const plan = await findOrCreatePlan(tx, card.id, month, line, target.categoryId, target.description.replace(/\s*\(\d+\/\d+\)$/, ""));
  await tx.transaction.update({ where: { id: target.id }, data: { installmentPlanId: plan.id, installmentNumber: line.installment.n } });
  await createFutureInstallments(tx, card, plan.id, month, line, target.categoryId, plan.description);
  return 1;
}

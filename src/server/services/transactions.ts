import "server-only";
import { db, type Tx } from "@/server/db";
import { installmentMonths, invoiceMonthFor, splitInstallments } from "@/domain/invoices";
import { pickSuggestion, type Suggestion } from "@/domain/suggest";
import { addMonthKey, monthKey } from "@/lib/months";
import { listFilterSchema, transactionSchema, type TxData, type TxFilter } from "@/lib/validation/transactions";
import { AppError, notFound, parseInput } from "@/server/errors";
import { ensureInvoice, PAID_LOCK } from "./invoices";
import type { Account, Prisma } from "@/generated/prisma/client";

export { payInvoice, invoiceTotal } from "./invoices";

const PAGE_SIZE = 100;

async function loadAccount(tx: Tx, id: string): Promise<Account> {
  const account = await tx.account.findUnique({ where: { id } });
  if (!account) throw new AppError("VALIDATION", "Conta não encontrada.", { accountId: ["Conta não encontrada."] });
  return account;
}

async function checkReferences(tx: Tx, v: TxData) {
  if (v.type === "TRANSFER") {
    await loadAccount(tx, v.toAccountId!);
    return;
  }
  const category = await tx.category.findUnique({ where: { id: v.categoryId! } });
  if (!category || category.kind !== v.type) {
    throw new AppError("VALIDATION", "Categoria não combina com o tipo.", { categoryId: ["Escolha uma categoria de " + (v.type === "EXPENSE" ? "despesa." : "receita.")] });
  }
}

/** Compras e estornos no cartão entram numa fatura; transferências (pagamentos) não. */
const usesInvoice = (account: Account, v: { type: string }) => account.type === "CREDIT_CARD" && v.type !== "TRANSFER";

/** Campos comuns a todas as linhas criadas a partir do formulário. */
function baseData(v: TxData) {
  return {
    type: v.type,
    date: v.date,
    description: v.description,
    accountId: v.accountId,
    toAccountId: v.type === "TRANSFER" ? v.toAccountId : null,
    categoryId: v.type === "TRANSFER" ? null : v.categoryId,
    projectId: v.type === "TRANSFER" ? null : v.projectId,
    reimbursable: v.type === "EXPENSE" && v.reimbursable,
    reimbursementStatus: v.type === "EXPENSE" && v.reimbursable ? ("PENDING" as const) : null,
    reimbursedBy: v.type === "EXPENSE" && v.reimbursable ? v.reimbursedBy : null,
    note: v.note,
  };
}

/**
 * Cria um lançamento. Compra no cartão vai para a fatura certa; com parcelas,
 * cria o plano e uma linha por parcela nas faturas seguintes.
 */
export async function createTransaction(raw: unknown) {
  const v = parseInput(transactionSchema, raw);
  return db.$transaction(async (tx) => {
    const account = await loadAccount(tx, v.accountId);
    await checkReferences(tx, v);
    const card = usesInvoice(account, v);
    if (v.installments > 1 && !(card && v.type === "EXPENSE")) throw new AppError("VALIDATION", "Parcelamento só no cartão.", { installments: ["Parcelamento só no cartão."] });

    if (!card) {
      return [await tx.transaction.create({ data: { ...baseData(v), month: monthKey(v.date), amountCents: v.amount } })];
    }

    const first = invoiceMonthFor(v.date, account.closingDay!, account.dueDay!);
    const months = installmentMonths(first, v.installments);
    const amounts = splitInstallments(v.amount, v.installments);
    const plan =
      v.installments > 1
        ? await tx.installmentPlan.create({
            data: {
              description: v.description,
              installmentCents: amounts[amounts.length - 1],
              count: v.installments,
              firstInvoiceMonth: first,
              purchaseDate: v.date,
              accountId: account.id,
              categoryId: v.categoryId!,
              projectId: v.projectId,
            },
          })
        : null;

    const created = [];
    for (const [i, month] of months.entries()) {
      const invoice = await ensureInvoice(tx, account, month);
      if (invoice.status === "PAID") throw new AppError("VALIDATION", "A fatura desta data já foi paga. Lance a compra com a data em que ela realmente entrou na fatura.");
      created.push(
        await tx.transaction.create({
          data: {
            ...baseData(v),
            description: plan ? `${v.description} (${i + 1}/${v.installments})` : v.description,
            month,
            amountCents: amounts[i],
            invoiceId: invoice.id,
            installmentPlanId: plan?.id ?? null,
            installmentNumber: plan ? i + 1 : null,
          },
        }),
      );
    }
    return created;
  });
}

/**
 * Altera um lançamento (só esta parcela, se for parcelado). Numa fatura paga,
 * valor, data e conta ficam travados.
 */
export async function updateTransaction(id: string, raw: unknown) {
  const v = parseInput(transactionSchema, raw);
  return db.$transaction(async (tx) => {
    const current = await tx.transaction.findUnique({ where: { id }, include: { invoice: true } });
    if (!current) throw notFound("Lançamento");
    if (current.paysInvoiceId) throw new AppError("VALIDATION", "Para mudar um pagamento de fatura, exclua-o e pague de novo.");
    await checkReferences(tx, v);

    if (current.invoice?.status === "PAID") {
      const locked = v.amount !== current.amountCents || v.date.getTime() !== current.date.getTime() || v.accountId !== current.accountId || v.type !== current.type;
      if (locked) throw new AppError("VALIDATION", PAID_LOCK);
      return tx.transaction.update({
        where: { id },
        data: { description: v.description, categoryId: v.categoryId, projectId: v.projectId, note: v.note },
      });
    }

    const account = await loadAccount(tx, v.accountId);
    let month = monthKey(v.date);
    let invoiceId: string | null = null;
    const placementUnchanged = v.date.getTime() === current.date.getTime() && v.accountId === current.accountId && v.type === current.type;
    if (placementUnchanged) {
      // Sem mudar data, conta ou tipo, o lançamento fica onde está (linhas importadas
      // da Zak26 ficam na fatura do mês da aba, mesmo com data antiga).
      month = current.month;
      invoiceId = current.invoiceId;
    } else if (usesInvoice(account, v)) {
      month = addMonthKey(invoiceMonthFor(v.date, account.closingDay!, account.dueDay!), (current.installmentNumber ?? 1) - 1);
      const invoice = await ensureInvoice(tx, account, month);
      if (invoice.status === "PAID") throw new AppError("VALIDATION", PAID_LOCK);
      invoiceId = invoice.id;
    }
    const { reimbursementStatus, ...rest } = baseData(v);
    return tx.transaction.update({
      where: { id },
      data: {
        ...rest,
        // Mantém o status de reembolso já quitado.
        reimbursementStatus: v.reimbursable && v.type === "EXPENSE" ? (current.reimbursementStatus ?? reimbursementStatus) : null,
        amountCents: v.amount,
        month,
        invoiceId,
      },
    });
  });
}

async function removeOne(tx: Tx, t: { id: string; paysInvoiceId: string | null }) {
  await tx.transaction.delete({ where: { id: t.id } });
  if (t.paysInvoiceId) await tx.invoice.update({ where: { id: t.paysInvoiceId }, data: { status: "OPEN", paidAt: null } });
}

/** Exclui um lançamento, ou todas as parcelas do plano. Faturas pagas travam a exclusão. */
export async function deleteTransaction(id: string, options: { wholePlan?: boolean } = {}) {
  return db.$transaction(async (tx) => {
    const current = await tx.transaction.findUnique({ where: { id }, include: { invoice: true } });
    if (!current) throw notFound("Lançamento");
    const targets =
      options.wholePlan && current.installmentPlanId
        ? await tx.transaction.findMany({ where: { installmentPlanId: current.installmentPlanId }, include: { invoice: true } })
        : [current];
    if (targets.some((t) => t.invoice?.status === "PAID")) throw new AppError("VALIDATION", PAID_LOCK);
    for (const t of targets) await removeOne(tx, t);
    if (current.installmentPlanId) {
      const left = await tx.transaction.count({ where: { installmentPlanId: current.installmentPlanId } });
      if (left === 0) await tx.installmentPlan.delete({ where: { id: current.installmentPlanId } });
    }
    return targets.length;
  });
}

export async function listTransactions(rawFilter: TxFilter = {}) {
  const f = listFilterSchema.parse(rawFilter);
  const where: Prisma.TransactionWhereInput = {
    ...(f.month ? { month: f.month } : {}),
    ...(f.accountId ? { OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] } : {}),
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.projectId ? { projectId: f.projectId } : {}),
    ...(f.q ? { description: { contains: f.q, mode: "insensitive" as const } } : {}),
  };
  const [items, count, sums] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { account: true, toAccount: true, category: true, project: true, invoice: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.transaction.count({ where }),
    db.transaction.groupBy({ by: ["type"], where, _sum: { amountCents: true } }),
  ]);
  const sumOf = (type: string) => sums.find((s) => s.type === type)?._sum.amountCents ?? 0;
  return { items, count, totalCents: sumOf("EXPENSE"), incomeCents: sumOf("INCOME"), pageSize: PAGE_SIZE };
}

/** Sugestão de categoria/conta para uma descrição, a partir do histórico. */
export async function suggestFor(description: string): Promise<Suggestion | null> {
  const history = await db.transaction.findMany({
    where: { type: { in: ["EXPENSE", "INCOME"] }, categoryId: { not: null } },
    select: { description: true, categoryId: true, accountId: true, projectId: true, date: true },
    orderBy: { date: "desc" },
    take: 3000,
  });
  return pickSuggestion(history, description);
}

/** Descrições recentes distintas, para o autocompletar. */
export async function recentDescriptions(limit = 400): Promise<string[]> {
  const rows = await db.transaction.findMany({
    where: { type: { in: ["EXPENSE", "INCOME"] } },
    select: { description: true },
    orderBy: { date: "desc" },
    take: 3000,
  });
  const out: string[] = [];
  const keys = new Set<string>();
  for (const r of rows) {
    const d = r.description.replace(/\s*\(\d+\/\d+\)\s*$/, "");
    const k = d.toLowerCase();
    if (keys.has(k)) continue;
    keys.add(k);
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

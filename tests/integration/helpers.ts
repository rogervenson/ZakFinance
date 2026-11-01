import { db } from "@/server/db";
import { ACCOUNT } from "@/domain/defaults";

export async function ids() {
  const accounts = await db.account.findMany();
  const categories = await db.category.findMany();
  const projects = await db.project.findMany();
  const acc = (name: string) => accounts.find((a) => a.name === name)!.id;
  const cat = (name: string, kind: "EXPENSE" | "INCOME" = "EXPENSE") => categories.find((c) => c.name === name && c.kind === kind)!.id;
  return {
    checking: acc(ACCOUNT.checking),
    card: acc(ACCOUNT.card),
    savings: acc(ACCOUNT.savings),
    broker: acc(ACCOUNT.broker),
    ticket: acc(ACCOUNT.ticket),
    cat,
    project: (name: string) => projects.find((p) => p.name === name)!.id,
  };
}

/** Limpa os lançamentos entre testes (mantém os cadastros do seed). */
export async function wipeTransactions() {
  await db.transaction.deleteMany();
  await db.installmentPlan.deleteMany();
  await db.invoice.deleteMany();
  await db.assetSnapshot.deleteMany();
  await db.holding.deleteMany();
  await db.importRun.deleteMany();
  await db.account.updateMany({ data: { openingBalanceCents: 0 } });
}

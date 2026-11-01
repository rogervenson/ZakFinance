import type { Metadata } from "next";
import { requireUser } from "@/server/auth/actor";
import { db } from "@/server/db";
import { listReimbursements } from "@/server/services/reimbursements";
import { formatBRL } from "@/lib/money";
import { toDateInput, today } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { ReimbursementsView } from "@/components/reimbursements/reimbursements-view";

export const metadata: Metadata = { title: "Reembolsos" };

export default async function ReimbursementsPage() {
  await requireUser();
  const [data, accounts] = await Promise.all([
    listReimbursements(),
    db.account.findMany({ where: { archivedAt: null, type: { not: "CREDIT_CARD" } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <>
      <PageHeader title="Reembolsos" description={`Gastos que alguém vai devolver. A receber: ${formatBRL(data.totalCents)}.`} />
      <ReimbursementsView
        today={toDateInput(today())}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        groups={data.groups.map((g) => ({
          who: g.who,
          totalCents: g.totalCents,
          items: g.items.map((t) => ({ id: t.id, date: toDateInput(t.date), description: t.description, amountCents: t.amountCents, accountName: t.account.name, reimbursedBy: t.reimbursedBy ?? "" })),
        }))}
        settled={data.settled.map((t) => ({ id: t.id, date: toDateInput(t.date), description: t.description, amountCents: t.amountCents, reimbursedBy: t.reimbursedBy ?? "" }))}
      />
    </>
  );
}

import type { Metadata } from "next";
import { requireUser } from "@/server/auth/actor";
import { listRecurrences } from "@/server/services/recurrences";
import { getEntryOptions } from "@/server/services/entry-options";
import { currentMonthKey } from "@/lib/months";
import { PageHeader } from "@/components/page-header";
import { RecurrencesView } from "@/components/recurrences/recurrences-view";

export const metadata: Metadata = { title: "Contas recorrentes" };

export default async function RecurrencesPage() {
  await requireUser();
  const [recs, options] = await Promise.all([listRecurrences(), getEntryOptions()]);
  return (
    <>
      <PageHeader
        title="Contas recorrentes"
        description="Salário, Ticket, luz, água, internet… Todo mês elas aparecem em Lançamentos como previstas, para você confirmar (ajustando o valor) ou pular."
      />
      <RecurrencesView
        options={options}
        currentMonth={currentMonthKey()}
        recurrences={recs.map((r) => ({
          id: r.id,
          description: r.description,
          type: r.type,
          amountCents: r.amountCents,
          accountId: r.accountId,
          accountName: r.account.name,
          toAccountId: r.toAccountId,
          toAccountName: r.toAccount?.name ?? null,
          categoryId: r.categoryId,
          categoryName: r.category?.name ?? null,
          dayOfMonth: r.dayOfMonth,
          startMonth: r.startMonth,
          endMonth: r.endMonth,
          archived: !!r.archivedAt,
        }))}
      />
    </>
  );
}

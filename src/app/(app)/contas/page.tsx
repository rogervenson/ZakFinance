import type { Metadata } from "next";
import { requireUser } from "@/server/auth/actor";
import { listAccounts } from "@/server/services/accounts";
import { PageHeader } from "@/components/page-header";
import { AccountsView } from "@/components/setup/accounts-view";
import { toDateInput, today } from "@/lib/dates";

export const metadata: Metadata = { title: "Contas" };

export default async function AccountsPage() {
  await requireUser();
  const accounts = await listAccounts({ includeArchived: true });
  return (
    <>
      <PageHeader title="Contas" description="Saldos calculados a partir dos lançamentos. No cartão, o valor é a fatura em aberto." />
      <AccountsView
        today={toDateInput(today())}
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balanceCents: a.balanceCents,
          openingBalanceCents: a.openingBalanceCents,
          openingDate: toDateInput(a.openingDate),
          closingDay: a.closingDay,
          dueDay: a.dueDay,
          archived: !!a.archivedAt,
        }))}
      />
    </>
  );
}

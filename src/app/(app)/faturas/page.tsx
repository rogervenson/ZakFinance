import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/actor";
import { db } from "@/server/db";
import { futureCommitted, listInvoices } from "@/server/services/invoices";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { monthLabel } from "@/lib/months";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceStatusBadge } from "@/components/invoices/status-badge";

export const metadata: Metadata = { title: "Faturas" };

export default async function InvoicesPage() {
  await requireUser();
  const [cards, invoices] = await Promise.all([
    db.account.findMany({ where: { type: "CREDIT_CARD", archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    listInvoices(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Faturas" description="Cada compra cai na fatura pelo dia de fechamento do cartão. Parcelas aparecem nas faturas seguintes." />
      {cards.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cartão cadastrado.</p>}
      {cards.map((card) => {
        const list = invoices.filter((i) => i.accountId === card.id);
        const unpaid = list.filter((i) => i.status !== "PAID").sort((a, b) => a.month.localeCompare(b.month));
        const next = unpaid[0];
        return (
          <Card key={card.id}>
            <CardHeader>
              <CardTitle>{card.name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Fecha dia {card.closingDay}, vence dia {card.dueDay}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Próxima a pagar</p>
                  <p className="text-xl font-semibold tabular-nums">{next ? formatBRL(next.totalCents) : "—"}</p>
                  {next && <p className="text-xs text-muted-foreground">vence {formatDate(next.dueDate)}</p>}
                </div>
                <div className="rounded-lg border p-3" data-testid={`future-${card.name}`}>
                  <p className="text-xs text-muted-foreground">Comprometido futuro</p>
                  <p className="text-xl font-semibold tabular-nums">{formatBRL(futureCommitted(list))}</p>
                  <p className="text-xs text-muted-foreground">parcelas nas faturas depois da atual</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Fatura</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Fecha</th>
                      <th className="px-3 py-2 font-medium">Vence</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {list.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                          Nenhuma fatura ainda.
                        </td>
                      </tr>
                    )}
                    {list.map((i) => (
                      <tr key={i.id} data-testid={`invoice-${i.month}`}>
                        <td className="px-3 py-2 font-medium">{monthLabel(i.month)}</td>
                        <td className="hidden px-3 py-2 tabular-nums sm:table-cell">{formatDate(i.closingDate)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatDate(i.dueDate)}</td>
                        <td className="px-3 py-2 text-right tabular-nums" data-testid="invoice-total">
                          {formatBRL(i.totalCents)}
                        </td>
                        <td className="px-3 py-2">
                          <InvoiceStatusBadge status={i.status} />
                        </td>
                        <td className="px-1 py-1 text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/faturas/${i.id}`}>Ver fatura</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

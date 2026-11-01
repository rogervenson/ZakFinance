import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth/actor";
import { db } from "@/server/db";
import { getInvoiceDetail } from "@/server/services/invoices";
import { formatBRL } from "@/lib/money";
import { formatDate, formatShortDate } from "@/lib/format";
import { monthLabel } from "@/lib/months";
import { toDateInput } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceStatusBadge } from "@/components/invoices/status-badge";
import { PayInvoiceButton } from "@/components/invoices/pay-invoice-button";

export const metadata: Metadata = { title: "Fatura" };

export default async function InvoicePage(props: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await props.params;
  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();
  const { invoice, status, items, totalCents, byCategory } = detail;
  const payAccounts = await db.account.findMany({ where: { archivedAt: null, type: { not: "CREDIT_CARD" } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/faturas">
          <ArrowLeft />
          Faturas
        </Link>
      </Button>
      <PageHeader
        title={`${invoice.account.name} — ${monthLabel(invoice.month)}`}
        description={`Fecha ${formatDate(invoice.closingDate)} · vence ${formatDate(invoice.dueDate)}`}
        actions={
          <>
            <InvoiceStatusBadge status={status} />
            {status !== "PAID" && totalCents > 0 && (
              <PayInvoiceButton
                invoiceId={invoice.id}
                totalCents={totalCents}
                dueDate={toDateInput(invoice.dueDate)}
                accounts={payAccounts.map((a) => ({ id: a.id, name: a.name }))}
              />
            )}
          </>
        }
      />
      {invoice.payment && (
        <p className="text-sm text-muted-foreground">
          Paga em {formatDate(invoice.payment.date)} pela {invoice.payment.account.name}: {formatBRL(invoice.payment.amountCents)}.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>
              {items.length} compras · {formatBRL(totalCents)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {items.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <span className="w-12 shrink-0 text-muted-foreground tabular-nums">{formatShortDate(t.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.category?.name ?? "Sem categoria"}
                      {t.project ? ` · ${t.project.name}` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatBRL(t.amountCents)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {byCategory.map((c) => (
                <li key={c.name} className="flex justify-between gap-2">
                  <span>{c.name}</span>
                  <span className="tabular-nums">{formatBRL(c.cents)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

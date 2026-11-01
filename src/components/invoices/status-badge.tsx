import { Badge } from "@/components/ui/badge";

const LABEL = { OPEN: "Aberta", CLOSED: "Fechada", PAID: "Paga" } as const;
const VARIANT = { OPEN: "outline", CLOSED: "destructive", PAID: "secondary" } as const;

export function InvoiceStatusBadge({ status }: { status: keyof typeof LABEL }) {
  return (
    <Badge data-testid="invoice-status" variant={VARIANT[status]}>
      {LABEL[status]}
    </Badge>
  );
}

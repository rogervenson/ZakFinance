// Leitor da fatura do cartão Santander (PDF).
//
// Lançamentos: "[flag] dd/mm DESCRIÇÃO [nn/NN] VALOR [US$]". A seção "Pagamento e
// Demais Créditos" traz o pagamento da fatura anterior (não é compra). Linhas sem
// data (IOF) herdam a data da linha anterior. O ano vem do vencimento: meses depois
// do mês de vencimento são do ano anterior (parcelas antigas).
import { brlToCents, linesOf, MONEY, utcDate, type StatementIssue } from "./common";

export interface CardLine {
  date: Date;
  description: string;
  /** Positivo = compra, negativo = estorno/crédito. */
  amountCents: number;
  usdCents: number | null;
  installment: { n: number; of: number } | null;
  cardholder: string;
  cardLast4: string;
}

export interface CardInvoice {
  /** Mês de vencimento "YYYY-MM". */
  month: string;
  dueDate: Date;
  closingDate: Date | null;
  totalCents: number;
  paymentsCents: number;
  lines: CardLine[];
  issues: StatementIssue[];
}

const HOLDER = /^@?\s*([A-ZÀ-Ü][A-ZÀ-Ü .]+?)\s+-\s+\d{4}\s+XXXX\s+XXXX\s+(\d{4})$/;
const ITEM = new RegExp(String.raw`^(?:\d\s+)?(?:(\d{2})\/(\d{2})\s+)?(.+?)\s+(?:(\d{2})\/(\d{2})\s+)?(-?${MONEY})(?:\s+(${MONEY}))?$`);
const SKIP = /^(VALOR TOTAL|Compra Data|COTAÇÃO|Detalhamento|\d+\/\d+$|Resumo)/i;

export function parseSantanderCard(text: string): CardInvoice {
  const lines = linesOf(text);
  const issues: StatementIssue[] = [];

  const afterLabel = (label: RegExp) => {
    const i = lines.findIndex((l) => label.test(l));
    return i >= 0 ? lines[i + 1] : undefined;
  };
  const totalCents = brlToCents(new RegExp(`(${MONEY})`).exec(afterLabel(/^Total a Pagar$/i) ?? "")?.[1] ?? "0,00");
  const dueMatch = /(\d{2})\/(\d{2})\/(\d{4})/.exec(afterLabel(/^Vencimento$/i) ?? "");
  const dueDate = dueMatch ? utcDate(Number(dueMatch[3]), Number(dueMatch[2]), Number(dueMatch[1])) : new Date(NaN);
  const dueYear = dueDate.getUTCFullYear();
  const dueMonth = dueDate.getUTCMonth() + 1;
  const month = dueMatch ? `${dueYear}-${String(dueMonth).padStart(2, "0")}` : "";
  const cycle = lines.find((l) => /Esta Fatura/i.test(l));
  const cm = cycle ? /a (\d{2})\/(\d{2})\/(\d{2})$/.exec(cycle) : null;
  const closingDate = cm ? utcDate(2000 + Number(cm[3]), Number(cm[2]), Number(cm[1])) : null;

  const start = lines.findIndex((l) => /^Detalhamento da Fatura$/i.test(l));
  const end = lines.findIndex((l, i) => i > start && /^Resumo da Fatura$/i.test(l));
  const body = start >= 0 ? lines.slice(start + 1, end > start ? end : undefined) : [];

  const out: CardLine[] = [];
  let holder = "";
  let last4 = "";
  let section = "";
  let lastDate: Date | null = null;
  let paymentsCents = 0;

  for (const line of body) {
    const h = HOLDER.exec(line);
    if (h) {
      holder = h[1].trim();
      last4 = h[2];
      continue;
    }
    if (/^(Pagamento e Demais Créditos|Parcelamentos|Despesas)$/i.test(line)) {
      section = line.toLowerCase();
      continue;
    }
    if (SKIP.test(line)) continue;
    const m = ITEM.exec(line);
    if (!m) continue;
    const [, dd, mm, desc, pn, pof, value, usd] = m;
    let date: Date | null = lastDate;
    if (dd && mm) {
      const mo = Number(mm);
      date = utcDate(mo > dueMonth ? dueYear - 1 : dueYear, mo, Number(dd));
    }
    if (!date) continue;
    lastDate = date;
    const cents = brlToCents(value.replace("-", "")) * (value.startsWith("-") ? -1 : 1);
    if (section.startsWith("pagamento")) {
      if (/FATURA/i.test(desc) && cents < 0) {
        paymentsCents += -cents;
        continue;
      }
    }
    if (cents === 0) continue;
    out.push({
      date,
      description: desc.trim(),
      amountCents: cents,
      usdCents: usd ? brlToCents(usd) : null,
      installment: pn && pof ? { n: Number(pn), of: Number(pof) } : null,
      cardholder: holder,
      cardLast4: last4,
    });
  }

  const sum = out.reduce((s, l) => s + l.amountCents, 0);
  if (!month) issues.push({ message: "Vencimento da fatura não encontrado." });
  if (sum !== totalCents) issues.push({ message: `A soma dos lançamentos (${sum / 100}) difere do total a pagar (${totalCents / 100}).` });
  return { month, dueDate, closingDate, totalCents, paymentsCents, lines: out, issues };
}

// Formatação para exibição (pt-BR).

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });

/** Data de calendário (meia-noite UTC) → "31/10/2026". */
export const formatDate = (d: Date | string) => dateFmt.format(new Date(d));

/** → "31/10". */
export const formatShortDate = (d: Date | string) => shortDateFmt.format(new Date(d));

/** Centavos → "1.234,56" (sem símbolo), para preencher inputs. */
export const centsToInput = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

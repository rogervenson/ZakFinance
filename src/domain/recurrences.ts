// Contas recorrentes: o que está previsto (e ainda não confirmado nem pulado) num mês.

export interface RecurrenceLike {
  id: string;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  archived: boolean;
}

/** Data da ocorrência no mês, com o dia limitado ao tamanho do mês. */
export function recurrenceDate(month: string, day: number): Date {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(day, last)));
}

export function isActiveIn(r: RecurrenceLike, month: string): boolean {
  return !r.archived && r.startMonth <= month && (!r.endMonth || month <= r.endMonth);
}

/** Recorrentes ativas no mês que ainda não viraram lançamento nem foram puladas. */
export function pendingRecurrences(
  recurrences: RecurrenceLike[],
  month: string,
  done: { confirmed: Set<string>; skipped: Set<string> },
): { recurrenceId: string; date: Date }[] {
  return recurrences
    .filter((r) => isActiveIn(r, month) && !done.confirmed.has(r.id) && !done.skipped.has(r.id))
    .map((r) => ({ recurrenceId: r.id, date: recurrenceDate(month, r.dayOfMonth) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

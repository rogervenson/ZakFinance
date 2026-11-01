// Calendar dates (birth, start, issue, expiration) are represented as Date at
// UTC midnight, so "2026-03-10" is always March 10 regardless of the server's or
// browser's time zone. Formatação para exibição em src/lib/format.ts.

const DAY_MS = 86_400_000;

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Sao_Paulo";

/** Today's date (in the app time zone) as UTC midnight. */
export function today(now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Hour of the day (0-23) in the app time zone. */
export function currentHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(h) % 24;
}

/** Parses "YYYY-MM-DD" into a Date (UTC midnight). Returns null when invalid. */
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** Date → "YYYY-MM-DD" (for date inputs). */
export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Calendar-day difference (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDayUTC(b).getTime() - startOfDayUTC(a).getTime()) / DAY_MS);
}


/** ISO date (YYYY-MM-DD) of a calendar Date, for audit metadata and keys. */
export const isoDate = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

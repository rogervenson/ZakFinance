// Meses são representados como "YYYY-MM".
import { today } from "@/lib/dates";

const LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const parse = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return { y, m };
};

const format = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

export function monthKey(date: Date): string {
  const d = new Date(date);
  return format(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

export function addMonthKey(key: string, n: number): string {
  const { y, m } = parse(key);
  const index = y * 12 + (m - 1) + n;
  return format(Math.floor(index / 12), (index % 12) + 1);
}

export function monthStart(key: string): Date {
  const { y, m } = parse(key);
  return new Date(Date.UTC(y, m - 1, 1));
}

export function monthEnd(key: string): Date {
  const { y, m } = parse(key);
  return new Date(Date.UTC(y, m, 0));
}

/** "2026-10" → "out/2026". */
export function monthLabel(key: string): string {
  const { y, m } = parse(key);
  return `${LABELS[m - 1]}/${y}`;
}

/** Mês corrente no fuso do app. */
export function currentMonthKey(now: Date = new Date()): string {
  return monthKey(today(now));
}

/** Mesma data, no mês indicado (dia limitado ao tamanho do mês). */
export function moveToMonth(date: Date, key: string): Date {
  const { y, m } = parse(key);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(new Date(date).getUTCDate(), last)));
}

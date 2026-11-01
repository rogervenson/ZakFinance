import { expect, test } from "vitest";
import { pendingRecurrences, recurrenceDate, type RecurrenceLike } from "@/domain/recurrences";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const rec = (over: Partial<RecurrenceLike> = {}): RecurrenceLike => ({ id: "luz", dayOfMonth: 20, startMonth: "2026-01", endMonth: null, archived: false, ...over });

test("recurrenceDate clamps the day to the month length", () => {
  expect(recurrenceDate("2026-02", 31)).toEqual(d("2026-02-28"));
  expect(recurrenceDate("2026-11", 5)).toEqual(d("2026-11-05"));
});

test("pending: active in the month, not confirmed and not skipped", () => {
  const list = pendingRecurrences([rec(), rec({ id: "agua" }), rec({ id: "net" }), rec({ id: "velha", endMonth: "2026-10" }), rec({ id: "futura", startMonth: "2026-12" }), rec({ id: "arq", archived: true })], "2026-11", {
    confirmed: new Set(["agua"]),
    skipped: new Set(["net"]),
  });
  expect(list).toEqual([{ recurrenceId: "luz", date: d("2026-11-20") }]);
});

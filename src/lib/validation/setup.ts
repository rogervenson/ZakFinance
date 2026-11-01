import { z } from "zod";
import { parseBRL } from "@/lib/money";
import { optionalId, requiredDate, requiredText } from "./common";

const day = (label: string) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((x, ctx) => {
      if (x === null || x === undefined || x === "") return null;
      const n = Number(x);
      if (!Number.isInteger(n) || n < 1 || n > 31) {
        ctx.addIssue({ code: "custom", message: `${label}: informe um dia entre 1 e 31.` });
        return z.NEVER;
      }
      return n;
    });

/** Saldo que pode ser zero ou negativo: "-1.234,56", "0". */
export const signedMoney = (label: string) =>
  z.union([z.string(), z.number()]).transform((x, ctx) => {
    if (typeof x === "number") return Math.round(x * 100);
    const s = x.trim();
    if (s === "" || /^-?0+([.,]0+)?$/.test(s)) return 0;
    const negative = s.startsWith("-");
    const cents = parseBRL(negative ? s.slice(1) : s);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label} inválido. Use, por exemplo, 1.234,56.` });
      return z.NEVER;
    }
    return negative ? -cents : cents;
  });

export const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "CREDIT_CARD", "BENEFIT", "INVESTMENT"] as const;

export const accountSchema = z
  .object({
    name: requiredText("Nome", 60),
    type: z.enum(ACCOUNT_TYPES, { error: "Escolha o tipo." }),
    openingBalance: signedMoney("Saldo inicial").default(0),
    openingDate: requiredDate("Data do saldo inicial"),
    closingDay: day("Dia de fechamento"),
    dueDay: day("Dia de vencimento"),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "CREDIT_CARD") return;
    if (!v.closingDay) ctx.addIssue({ code: "custom", path: ["closingDay"], message: "Informe o dia de fechamento." });
    if (!v.dueDay) ctx.addIssue({ code: "custom", path: ["dueDay"], message: "Informe o dia de vencimento." });
  });
export type AccountInput = z.input<typeof accountSchema>;

export const adjustBalanceSchema = z.object({
  accountId: z.string().min(1),
  realBalance: signedMoney("Saldo real"),
  date: requiredDate(),
});

export const categorySchema = z.object({
  name: requiredText("Nome", 60),
  kind: z.enum(["EXPENSE", "INCOME"]),
  countsInCostOfLiving: z.boolean().default(true),
  continuesAfterRetirement: z.boolean().default(false),
});
export type CategoryInput = z.input<typeof categorySchema>;

export const projectSchema = z.object({
  name: requiredText("Nome", 60),
  budget: z
    .string()
    .nullish()
    .transform((x, ctx) => {
      if (!x || !x.trim()) return null;
      const c = parseBRL(x);
      if (c === null) {
        ctx.addIssue({ code: "custom", message: "Orçamento inválido." });
        return z.NEVER;
      }
      return c;
    }),
});
export type ProjectInput = z.input<typeof projectSchema>;

export const idSchema = z.object({ id: z.string().min(1), archived: z.boolean().default(true) });
export { optionalId };

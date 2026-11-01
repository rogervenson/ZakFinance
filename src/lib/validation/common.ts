import { z } from "zod";
import { parseDateInput } from "@/lib/dates";
import { parseBRL } from "@/lib/money";

// Formulários trabalham com strings; os schemas normalizam para o formato guardado.

export const requiredText = (label: string, max = 150) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .trim()
    .min(1, `${label} é obrigatório.`)
    .max(max, `Use no máximo ${max} caracteres.`);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .nullish()
    .transform((x) => (x ? x : null));

export const optionalId = z
  .string()
  .nullish()
  .transform((x) => (x ? x : null));

export const requiredDate = (label = "Data") =>
  z.string({ error: `${label} é obrigatória.` }).transform((x, ctx) => {
    const d = parseDateInput(x);
    if (!d) {
      ctx.addIssue({ code: "custom", message: `${label} inválida.` });
      return z.NEVER;
    }
    return d;
  });

/** Valor digitado em reais → centavos (> 0). */
export const money = (label = "Valor") =>
  z.union([z.string(), z.number()], { error: `${label} é obrigatório.` }).transform((x, ctx) => {
    const cents = typeof x === "number" ? (x > 0 ? Math.round(x * 100) : null) : parseBRL(x);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: `${label} inválido. Use, por exemplo, 1.234,56.` });
      return z.NEVER;
    }
    return cents;
  });

export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

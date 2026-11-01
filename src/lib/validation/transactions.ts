import { z } from "zod";
import { money, optionalId, optionalText, requiredDate, requiredText } from "./common";

export const TX_TYPES = ["EXPENSE", "INCOME", "TRANSFER"] as const;

export const transactionSchema = z
  .object({
    type: z.enum(TX_TYPES, { error: "Escolha o tipo." }),
    date: requiredDate(),
    description: requiredText("Descrição", 120),
    amount: money(),
    accountId: z.string({ error: "Escolha a conta." }).min(1, "Escolha a conta."),
    toAccountId: optionalId,
    categoryId: optionalId,
    projectId: optionalId,
    installments: z.coerce.number().int().min(1, "Parcelas: de 1 a 48.").max(48, "Parcelas: de 1 a 48.").default(1),
    reimbursable: z.boolean().default(false),
    reimbursedBy: optionalText(80),
    note: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.type === "TRANSFER") {
      if (!v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Escolha a conta de destino." });
      else if (v.toAccountId === v.accountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "A conta de destino deve ser diferente da de origem." });
    } else if (!v.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Escolha a categoria." });
    }
  });

export type TxInput = z.input<typeof transactionSchema>;
export type TxData = z.output<typeof transactionSchema>;

export const listFilterSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  projectId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type TxFilter = z.input<typeof listFilterSchema>;

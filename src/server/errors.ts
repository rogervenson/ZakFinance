import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { fieldErrorsFrom } from "@/lib/validation/common";

export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT";

/** Erro de negócio com mensagem segura para mostrar ao usuário. */
export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Valida com Zod e transforma falhas em AppError de validação. */
export function parseInput<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: ZodError } }, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError("VALIDATION", "Confira os campos destacados.", fieldErrorsFrom(result.error));
  return result.data;
}

export const notFound = (what = "Registro") => new AppError("NOT_FOUND", `${what} não encontrado.`);

/** Normaliza qualquer erro em AppError, registrando só o que é seguro. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new AppError("VALIDATION", "Confira os campos destacados.", fieldErrorsFrom(error));
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return new AppError("CONFLICT", "Já existe um registro com esses dados.");
    if (error.code === "P2003") return new AppError("CONFLICT", "Este registro está em uso e não pode ser removido.");
    if (error.code === "P2025") return notFound();
  }
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message.split("\n")[0].slice(0, 200) : "";
  console.error(`[error] ${name}: ${message}`);
  return new AppError("VALIDATION", "Algo deu errado. Tente novamente.");
}

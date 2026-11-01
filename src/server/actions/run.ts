import "server-only";
import type { ActionResult } from "@/lib/action-result";
import { requireActor, type AuthUser } from "@/server/auth/actor";
import { toAppError } from "@/server/errors";

/** Roda uma operação autenticada e transforma erros em ActionResult. */
export async function run<T>(fn: (actor: AuthUser) => Promise<T>, options?: { allowPasswordChange?: boolean }): Promise<ActionResult<T>> {
  try {
    const actor = await requireActor(options);
    return { ok: true, data: await fn(actor) };
  } catch (error) {
    // Erros de controle do Next.js (redirect/notFound) precisam propagar.
    if (error && typeof error === "object" && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_")) {
      throw error;
    }
    const e = toAppError(error);
    return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  }
}

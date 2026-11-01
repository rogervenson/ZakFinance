"use server";

import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { toAppError } from "@/server/errors";
import { changeOwnPassword, login, logout } from "@/server/services/auth";
import { run } from "./run";

function safeRedirectTarget(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value : "";
  // Só caminhos internos, para evitar open redirect.
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  let mustChange = false;
  try {
    ({ mustChangePassword: mustChange } = await login({ email: formData.get("email"), password: formData.get("password") }));
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
  redirect(mustChange ? "/account/password" : safeRedirectTarget(formData.get("from")));
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function changePasswordAction(values: unknown) {
  return run((actor) => changeOwnPassword(actor, values), { allowPasswordChange: true });
}

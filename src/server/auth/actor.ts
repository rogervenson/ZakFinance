import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { AppError } from "@/server/errors";
import { readSession } from "./session";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

/** Usuário da requisição atual. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await readSession();
  return session ? { ...session.user } : null;
});

/** Para páginas: redireciona ao login sem sessão, e à troca de senha quando obrigatória. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  return user;
}

/** Para Server Actions e Route Handlers: lança erro em vez de redirecionar. */
export async function requireActor(options: { allowPasswordChange?: boolean } = {}): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
  if (user.mustChangePassword && !options.allowPasswordChange) throw new AppError("FORBIDDEN", "Troque sua senha para continuar.");
  return user;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/actor";
import { Logo } from "@/components/layout/logo";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Trocar senha" };

/** Fica fora do layout do app para funcionar enquanto a troca é obrigatória. */
export default async function PasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const forced = user.mustChangePassword;
  return (
    <div className="flex min-h-svh flex-col px-6 py-8 sm:px-10">
      <Logo />
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{forced ? "Escolha uma nova senha" : "Trocar senha"}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {forced ? "Por segurança, troque a senha inicial antes de continuar." : "Informe a senha atual e a nova."}
          </p>
          <PasswordForm forced={forced} />
        </div>
      </div>
    </div>
  );
}

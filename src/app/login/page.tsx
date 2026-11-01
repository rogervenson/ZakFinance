import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/actor";
import { Logo } from "@/components/layout/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage(props: { searchParams: Promise<{ from?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/account/password" : "/");
  const { from } = await props.searchParams;

  return (
    <div className="flex min-h-svh flex-col px-6 py-8 sm:px-10">
      <Logo />
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Acesse seu controle financeiro.</p>
          <LoginForm redirectTo={typeof from === "string" ? from : "/"} />
        </div>
      </div>
    </div>
  );
}

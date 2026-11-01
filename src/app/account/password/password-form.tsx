"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { changePasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const field = (name: keyof typeof values, label: string, autoComplete: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type="password"
        autoComplete={autoComplete}
        value={values[name]}
        onChange={(e) => setValues({ ...values, [name]: e.target.value })}
        aria-invalid={!!errors[name]}
        required
      />
      {errors[name] ? <p className="text-sm text-destructive">{errors[name][0]}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await changePasswordAction(values);
          if (!res.ok) {
            setErrors(res.fieldErrors ?? {});
            setFormError(res.fieldErrors ? null : res.error);
            return;
          }
          toast.success("Senha alterada.");
          router.push("/");
          router.refresh();
        });
      }}
    >
      {field("current", "Senha atual", "current-password")}
      {field("next", "Nova senha", "new-password", "Pelo menos 10 caracteres.")}
      {field("confirm", "Confirme a nova senha", "new-password")}
      {formError && <p className="rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</p>}
      <div className="flex gap-2">
        {!forced && (
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancelar
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar senha
        </Button>
      </div>
    </form>
  );
}

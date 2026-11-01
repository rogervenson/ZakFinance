import { Label } from "@/components/ui/label";

/** Rótulo + controle + erro, com o id ligando o rótulo ao campo. */
export function FormField({ id, label, error, hint, children }: { id: string; label: string; error?: string[]; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error?.[0] ? <p className="text-sm text-destructive">{error[0]}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { archiveCategoryAction, archiveProjectAction, saveCategoryAction, saveProjectAction } from "@/server/actions/setup";
import { formatBRL } from "@/lib/money";
import { centsToInput } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/form-field";
import { ConfirmButton } from "@/components/confirm-button";

interface CategoryRow {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  countsInCostOfLiving: boolean;
  continuesAfterRetirement: boolean;
}
interface ProjectRow {
  id: string;
  name: string;
  budgetCents: number | null;
  spentCents: number;
}

type Editing = { type: "category"; row: CategoryRow | null; kind: "EXPENSE" | "INCOME" } | { type: "project"; row: ProjectRow | null } | null;

function CategoryDialog({ row, kind, onClose }: { row: CategoryRow | null; kind: "EXPENSE" | "INCOME"; onClose: () => void }) {
  const [name, setName] = useState(row?.name ?? "");
  const [counts, setCounts] = useState(row?.countsInCostOfLiving ?? true);
  const [continues, setContinues] = useState(row?.continuesAfterRetirement ?? false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Editar categoria" : kind === "EXPENSE" ? "Nova categoria de despesa" : "Nova categoria de receita"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await saveCategoryAction(row?.id ?? null, { name, kind, countsInCostOfLiving: kind === "EXPENSE" ? counts : false, continuesAfterRetirement: kind === "INCOME" ? continues : false });
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                if (!res.fieldErrors) toast.error(res.error);
                return;
              }
              toast.success("Categoria salva.");
              onClose();
            });
          }}
        >
          <FormField id="cat-name" label="Nome" error={errors.name}>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </FormField>
          {kind === "EXPENSE" ? (
            <div className="flex items-center gap-2">
              <Checkbox id="cat-counts" checked={counts} onCheckedChange={(v) => setCounts(v === true)} />
              <Label htmlFor="cat-counts">Entra no custo de vida</Label>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Checkbox id="cat-continues" checked={continues} onCheckedChange={(v) => setContinues(v === true)} />
              <Label htmlFor="cat-continues">Continua depois da aposentadoria</Label>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDialog({ row, onClose }: { row: ProjectRow | null; onClose: () => void }) {
  const [name, setName] = useState(row?.name ?? "");
  const [budget, setBudget] = useState(row?.budgetCents ? centsToInput(row.budgetCents) : "");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row ? "Editar projeto" : "Novo projeto"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await saveProjectAction(row?.id ?? null, { name, budget });
              if (!res.ok) {
                setErrors(res.fieldErrors ?? {});
                if (!res.fieldErrors) toast.error(res.error);
                return;
              }
              toast.success("Projeto salvo.");
              onClose();
            });
          }}
        >
          <FormField id="prj-name" label="Nome" error={errors.name}>
            <Input id="prj-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </FormField>
          <FormField id="prj-budget" label="Orçamento (opcional)" error={errors.budget}>
            <Input id="prj-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveToggle({ name, archived, onConfirm }: { name: string; archived: boolean; onConfirm: () => ReturnType<typeof archiveCategoryAction> }) {
  return (
    <ConfirmButton
      label={archived ? "Reativar" : "Arquivar"}
      title={archived ? `Reativar ${name}?` : `Arquivar ${name}?`}
      description={archived ? undefined : "Some das listas de escolha; o histórico continua."}
      onConfirm={onConfirm}
    >
      {archived ? <ArchiveRestore /> : <Archive />}
    </ConfirmButton>
  );
}

export function CategoriesView({ categories, projects, archived }: { categories: CategoryRow[]; projects: ProjectRow[]; archived: boolean }) {
  const [editing, setEditing] = useState<Editing>(null);

  const section = (kind: "EXPENSE" | "INCOME", title: string) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        {!archived && (
          <Button size="sm" variant="outline" onClick={() => setEditing({ type: "category", row: null, kind })}>
            <Plus />
            Nova
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {categories
            .filter((c) => c.kind === kind)
            .map((c) => (
              <li key={c.id} data-testid={`category-${c.name}`} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {kind === "EXPENSE" && !c.countsInCostOfLiving && <Badge variant="outline">fora do custo de vida</Badge>}
                {kind === "INCOME" && c.continuesAfterRetirement && <Badge variant="outline">continua na aposentadoria</Badge>}
                <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => setEditing({ type: "category", row: c, kind })}>
                  <Pencil />
                </Button>
                <ArchiveToggle name={c.name} archived={archived} onConfirm={() => archiveCategoryAction(c.id, !archived)} />
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {section("EXPENSE", "Despesas")}
      {section("INCOME", "Receitas")}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Projetos</CardTitle>
          {!archived && (
            <Button size="sm" variant="outline" onClick={() => setEditing({ type: "project", row: null })}>
              <Plus />
              Novo
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {projects.map((p) => (
              <li key={p.id} data-testid={`project-${p.name}`} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    Gasto {formatBRL(p.spentCents)}
                    {p.budgetCents ? ` de ${formatBRL(p.budgetCents)}` : ""}
                  </span>
                </span>
                <Button variant="ghost" size="sm" aria-label="Editar" onClick={() => setEditing({ type: "project", row: p })}>
                  <Pencil />
                </Button>
                <ArchiveToggle name={p.name} archived={archived} onConfirm={() => archiveProjectAction(p.id, !archived)} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {editing?.type === "category" && <CategoryDialog row={editing.row} kind={editing.kind} onClose={() => setEditing(null)} />}
      {editing?.type === "project" && <ProjectDialog row={editing.row} onClose={() => setEditing(null)} />}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/auth/actor";
import { listCategories, listProjects } from "@/server/services/categories";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CategoriesView } from "@/components/setup/categories-view";

export const metadata: Metadata = { title: "Categorias e projetos" };

export default async function CategoriesPage(props: { searchParams: Promise<{ arquivadas?: string }> }) {
  await requireUser();
  const archived = (await props.searchParams).arquivadas === "1";
  const [categories, projects] = await Promise.all([listCategories({ archived }), listProjects({ archived })]);
  return (
    <>
      <PageHeader
        title={archived ? "Categorias e projetos arquivados" : "Categorias e projetos"}
        description="Projetos agrupam gastos de uma iniciativa (Sótão, Agro) e ficam fora do custo de vida."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={archived ? "/categorias" : "/categorias?arquivadas=1"}>{archived ? "Ver ativas" : "Ver arquivadas"}</Link>
          </Button>
        }
      />
      <CategoriesView
        archived={archived}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          countsInCostOfLiving: c.countsInCostOfLiving,
          continuesAfterRetirement: c.continuesAfterRetirement,
        }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name, budgetCents: p.budgetCents, spentCents: p.spentCents }))}
      />
    </>
  );
}

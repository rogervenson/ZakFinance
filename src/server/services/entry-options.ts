import "server-only";
import { db } from "@/server/db";
import { toDateInput, today } from "@/lib/dates";
import { recentDescriptions } from "./transactions";
import type { EntryOptions } from "@/components/transactions/types";

/** Opções dos formulários de lançamento (só cadastros ativos). */
export async function getEntryOptions(): Promise<EntryOptions> {
  const [accounts, categories, projects, descriptions] = await Promise.all([
    db.account.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.category.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.project.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    recentDescriptions(),
  ]);
  return {
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    descriptions,
    today: toDateInput(today()),
  };
}

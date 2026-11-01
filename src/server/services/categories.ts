import "server-only";
import { db } from "@/server/db";
import { parseInput } from "@/server/errors";
import { categorySchema, projectSchema } from "@/lib/validation/setup";

export async function listCategories(options: { kind?: "EXPENSE" | "INCOME"; archived?: boolean } = {}) {
  return db.category.findMany({
    where: { ...(options.kind ? { kind: options.kind } : {}), archivedAt: options.archived ? { not: null } : null },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createCategory(raw: unknown) {
  return db.category.create({ data: parseInput(categorySchema, raw) });
}

export async function updateCategory(id: string, raw: unknown) {
  return db.category.update({ where: { id }, data: parseInput(categorySchema, raw) });
}

/** Categorias com histórico nunca são apagadas, só arquivadas. */
export async function setCategoryArchived(id: string, archived: boolean) {
  return db.category.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}

export async function listProjects(options: { archived?: boolean } = {}) {
  const [projects, sums] = await Promise.all([
    db.project.findMany({ where: { archivedAt: options.archived ? { not: null } : null }, orderBy: { name: "asc" } }),
    db.transaction.groupBy({ by: ["projectId"], where: { type: "EXPENSE", projectId: { not: null } }, _sum: { amountCents: true } }),
  ]);
  const spent = new Map(sums.map((s) => [s.projectId, s._sum.amountCents ?? 0]));
  return projects.map((p) => ({ ...p, spentCents: spent.get(p.id) ?? 0 }));
}

export async function createProject(raw: unknown) {
  const v = parseInput(projectSchema, raw);
  return db.project.create({ data: { name: v.name, budgetCents: v.budget } });
}

export async function updateProject(id: string, raw: unknown) {
  const v = parseInput(projectSchema, raw);
  return db.project.update({ where: { id }, data: { name: v.name, budgetCents: v.budget } });
}

export async function setProjectArchived(id: string, archived: boolean) {
  return db.project.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
}

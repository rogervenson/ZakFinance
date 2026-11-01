"use server";

import { revalidatePath } from "next/cache";
import { run } from "./run";
import { adjustBalance, createAccount, setAccountArchived, updateAccount } from "@/server/services/accounts";
import {
  createCategory,
  createProject,
  setCategoryArchived,
  setProjectArchived,
  updateCategory,
  updateProject,
} from "@/server/services/categories";

const done = <T>(paths: string[]) => (r: T) => {
  for (const p of paths) revalidatePath(p);
  return r;
};

export async function saveAccountAction(id: string | null, values: unknown) {
  return run(async () => {
    await (id ? updateAccount(id, values) : createAccount(values));
    done(["/contas"])(null);
  });
}

export async function archiveAccountAction(id: string, archived: boolean) {
  return run(async () => {
    await setAccountArchived(id, archived);
    done(["/contas"])(null);
  });
}

export async function adjustBalanceAction(values: unknown) {
  return run(async () => {
    await adjustBalance(values);
    done(["/contas", "/lancamentos", "/"])(null);
  });
}

export async function saveCategoryAction(id: string | null, values: unknown) {
  return run(async () => {
    await (id ? updateCategory(id, values) : createCategory(values));
    done(["/categorias"])(null);
  });
}

export async function archiveCategoryAction(id: string, archived: boolean) {
  return run(async () => {
    await setCategoryArchived(id, archived);
    done(["/categorias"])(null);
  });
}

export async function saveProjectAction(id: string | null, values: unknown) {
  return run(async () => {
    await (id ? updateProject(id, values) : createProject(values));
    done(["/categorias"])(null);
  });
}

export async function archiveProjectAction(id: string, archived: boolean) {
  return run(async () => {
    await setProjectArchived(id, archived);
    done(["/categorias"])(null);
  });
}

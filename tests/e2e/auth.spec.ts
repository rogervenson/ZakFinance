import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_ENV } from "./env";
import { signIn } from "./support/login";

test("wrong password shows a pt-BR error", async ({ page }) => {
  await signIn(page, E2E_ENV.ADMIN_EMAIL, "senha-errada");
  await expect(page.getByText("E-mail ou senha inválidos")).toBeVisible();
});

test("first sign-in forces a password change, then opens the dashboard", async ({ page }) => {
  const client = new pg.Client({ connectionString: E2E_ENV.DATABASE_URL });
  await client.connect();
  await client.query('UPDATE users SET "mustChangePassword" = true');
  await client.end();

  await signIn(page);
  await expect(page).toHaveURL(/\/account\/password/);
  await page.getByLabel("Senha atual").fill(E2E_ENV.ADMIN_PASSWORD);
  await page.getByLabel("Nova senha", { exact: true }).fill("Nova@123456");
  await page.getByLabel("Confirme a nova senha").fill("Nova@123456");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();

  // Volta a senha padrão para os outros testes.
  const { hashPassword } = await import("../../src/server/auth/password");
  const c2 = new pg.Client({ connectionString: E2E_ENV.DATABASE_URL });
  await c2.connect();
  await c2.query('UPDATE users SET "passwordHash" = $1, "mustChangePassword" = false', [await hashPassword(E2E_ENV.ADMIN_PASSWORD)]);
  await c2.end();
});

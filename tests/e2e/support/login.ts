import type { Page } from "@playwright/test";
import { E2E_ENV } from "../env";

export async function signIn(page: Page, email = E2E_ENV.ADMIN_EMAIL, password = E2E_ENV.ADMIN_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

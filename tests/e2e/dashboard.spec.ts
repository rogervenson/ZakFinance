import { expect, test } from "@playwright/test";
import { signIn } from "./support/login";

test("month dashboard shows income, expenses and where the money went", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  // Seed e2e: "vitorino" R$ 538,53 no cartão, fatura de out/2026.
  await page.goto("/?mes=2026-10");
  await expect(page.getByTestId("stat-income")).toContainText("R$ 0,00");
  await expect(page.getByTestId("stat-expense")).toContainText("R$ 538,53");
  await expect(page.getByTestId("category-bars")).toContainText("Mercado");
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page).toHaveURL(/mes=2026-11/);
});

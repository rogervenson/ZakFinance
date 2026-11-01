import { expect, test } from "@playwright/test";
import { signIn } from "./support/login";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
});

test("creates a credit card account", async ({ page }) => {
  await page.goto("/contas");
  await page.getByRole("button", { name: "Nova conta" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill("Nubank");
  await dialog.getByLabel("Tipo").selectOption("CREDIT_CARD");
  await dialog.getByLabel("Dia de fechamento").fill("3");
  await dialog.getByLabel("Dia de vencimento").fill("10");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("account-Nubank")).toContainText("Cartão de crédito");
});

test("adjusting the real balance creates an explicit transaction", async ({ page }) => {
  await page.goto("/contas");
  const card = page.getByTestId("account-Conta Santander");
  await card.getByRole("button", { name: "Ajustar saldo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Saldo real hoje").fill("100,00");
  await dialog.getByRole("button", { name: "Ajustar" }).click();
  await expect(card).toContainText("R$ 100,00");
});

test("archiving a category hides it from the active list", async ({ page }) => {
  await page.goto("/categorias");
  const row = page.getByTestId("category-Carro");
  await row.getByRole("button", { name: "Arquivar" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Arquivar" }).click();
  await expect(page.getByTestId("category-Carro")).toHaveCount(0);
  await page.getByRole("link", { name: "Ver arquivadas" }).click();
  await expect(page.getByTestId("category-Carro")).toBeVisible();
});

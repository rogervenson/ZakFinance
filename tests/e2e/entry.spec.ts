import { expect, test } from "@playwright/test";
import { signIn } from "./support/login";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  await page.goto("/lancamentos");
});

test("description fills category and account from history, Enter saves", async ({ page }) => {
  const form = page.getByTestId("quick-entry");
  await form.getByLabel("Descrição").fill("vitorino");
  await form.getByLabel("Valor").focus(); // blur da descrição busca a sugestão
  await expect(form.getByLabel("Categoria")).toHaveValue(/.+/);
  await expect(form.getByLabel("Categoria").locator("option:checked")).toHaveText("Mercado");
  await expect(form.getByLabel("Conta", { exact: true }).locator("option:checked")).toHaveText("Cartão Santander");
  await form.getByLabel("Valor").fill("45,90");
  await form.getByLabel("Valor").press("Enter");
  await expect(page.getByText("Lançado")).toBeVisible();
  const list = page.getByTestId("transaction-list");
  await expect(list.getByText("R$ 45,90")).toBeVisible();
  await expect(form.getByLabel("Descrição")).toBeFocused();
  await expect(form.getByLabel("Descrição")).toHaveValue("");
});

test("installments on the card create one row per month and can be deleted together", async ({ page }) => {
  const form = page.getByTestId("quick-entry");
  await form.getByLabel("Descrição").fill("farmácia");
  await form.getByLabel("Categoria").selectOption({ label: "Saúde" });
  await form.getByLabel("Conta", { exact: true }).selectOption({ label: "Cartão Santander" });
  await form.getByLabel("Valor").fill("90,00");
  await form.getByLabel("Parcelas").fill("3");
  await form.getByLabel("Parcelas").press("Enter");
  await expect(page.getByText("Lançado")).toBeVisible();

  const list = page.getByTestId("transaction-list");
  const row = list.getByRole("row", { name: /farmácia \(1\/3\)/ });
  await expect(row).toBeVisible();
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(list.getByText("farmácia (2/3)")).toBeVisible();
  await page.getByRole("button", { name: "Mês anterior" }).click();

  await row.getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Todas as parcelas" }).click();
  await expect(list.getByText("farmácia (1/3)")).toHaveCount(0);
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(list.getByText("farmácia (2/3)")).toHaveCount(0);
});

test("invalid amount shows a pt-BR message", async ({ page }) => {
  const form = page.getByTestId("quick-entry");
  await form.getByLabel("Descrição").fill("teste");
  await form.getByLabel("Categoria").selectOption({ label: "Mercado" });
  await form.getByLabel("Valor").fill("abc");
  await form.getByLabel("Valor").press("Enter");
  await expect(form.getByText("Valor inválido. Use, por exemplo, 1.234,56.")).toBeVisible();
});

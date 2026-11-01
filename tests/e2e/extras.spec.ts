import { expect, test } from "@playwright/test";
import { signIn } from "./support/login";

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
});

test("a recurring bill appears as planned in Lançamentos and is confirmed with one click", async ({ page }) => {
  await page.goto("/recorrentes");
  await page.getByRole("button", { name: "Nova recorrente" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Descrição").fill("Celesc");
  await dialog.getByLabel("Valor previsto").fill("106,24");
  await dialog.getByLabel("Dia do mês").fill("20");
  await dialog.getByLabel("Categoria").selectOption({ label: "Despesas" });
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("recurrence-list")).toContainText("Celesc");

  await page.goto("/lancamentos");
  const planned = page.getByTestId("planned-Celesc");
  await expect(planned).toBeVisible();
  await planned.getByLabel("Valor de Celesc").fill("110,00");
  await planned.getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByTestId("planned-Celesc")).toHaveCount(0);
  await expect(page.getByTestId("transaction-list").getByRole("row", { name: /Celesc R\$ 110,00/ })).toBeVisible();
});

test("a reimbursable expense shows under who owes it and can be marked as received", async ({ page }) => {
  await page.goto("/lancamentos");
  const form = page.getByTestId("quick-entry");
  await form.getByLabel("Descrição").fill("remédio da Gisele");
  await form.getByLabel("Categoria").selectOption({ label: "Reembolsável" });
  await form.getByLabel("Valor").fill("80,00");
  await form.getByLabel("Reembolsável").check();
  await form.getByLabel("Quem reembolsa").fill("Gisele");
  await form.getByLabel("Quem reembolsa").press("Enter");
  await expect(page.getByText("Lançado")).toBeVisible();

  await page.goto("/reembolsos");
  const group = page.getByTestId("reimb-Gisele");
  await expect(group).toContainText("R$ 80,00");
  await group.getByRole("button", { name: "Marcar como recebido" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByTestId("reimb-Gisele")).toHaveCount(0);
  await expect(page.getByText("Recebidos recentemente")).toBeVisible();
});

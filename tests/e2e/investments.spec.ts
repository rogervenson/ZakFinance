import { expect, test } from "@playwright/test";
import { signIn } from "./support/login";

test("buy an asset, record a dividend and save the month's net worth", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  await page.goto("/investimentos");

  await page.getByRole("button", { name: "Compra ou venda" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Ativo", { exact: true }).fill("TAEE11");
  await dialog.getByLabel("Tipo (para um ativo novo)").selectOption("ACAO");
  await dialog.getByLabel("Quantidade").fill("37");
  await dialog.getByLabel("Preço").fill("33,37");
  await dialog.getByRole("button", { name: "Registrar" }).click();
  const row = page.getByTestId("portfolio").getByRole("row", { name: "TAEE11" });
  await expect(row).toContainText("37");
  await expect(row).toContainText("R$ 33,37");

  await row.getByRole("button", { name: "Provento" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Valor").fill("22,07");
  await dialog.getByRole("button", { name: "Registrar" }).click();
  await expect(row).toContainText("R$ 22,07");

  await page.getByRole("button", { name: /^Registrar / }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Previdência").fill("329.803,75");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByTestId("snapshots")).toContainText("R$ 329.803,75");
});

import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/login";

const brl = (text: string) => {
  const neg = text.includes("-");
  const n = Number(text.replace(/[^\d,]/g, "").replace(",", "."));
  return Math.round((neg ? -n : n) * 100);
};

async function checkingBalance(page: Page) {
  await page.goto("/contas");
  const text = await page.getByTestId("account-Conta Santander").getByTestId("balance").innerText();
  return brl(text);
}

test("installments show as future commitment and paying an invoice debits checking", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();

  await page.goto("/lancamentos");
  const form = page.getByTestId("quick-entry");
  await form.getByLabel("Descrição").fill("notebook");
  await form.getByLabel("Categoria").selectOption({ label: "Despesas" });
  await form.getByLabel("Conta", { exact: true }).selectOption({ label: "Cartão Santander" });
  await form.getByLabel("Valor").fill("300,00");
  await form.getByLabel("Parcelas").fill("3");
  await form.getByLabel("Parcelas").press("Enter");
  await expect(page.getByText("Lançado")).toBeVisible();

  await page.goto("/faturas");
  await expect(page.getByTestId("invoice-2026-11")).toBeVisible();
  await expect(page.getByTestId("invoice-2026-12")).toContainText("R$ 100,00");
  await expect(page.getByTestId("invoice-2027-01")).toContainText("R$ 100,00");
  await expect(page.getByTestId("future-Cartão Santander")).toContainText("R$ 200,00");

  const before = await checkingBalance(page);
  await page.goto("/faturas");
  const novRow = page.getByTestId("invoice-2026-11");
  const total = brl(await novRow.getByTestId("invoice-total").innerText());
  await novRow.getByRole("link", { name: "Ver fatura" }).click();
  await expect(page.getByText("notebook (1/3)")).toBeVisible();
  await page.getByRole("button", { name: "Pagar fatura" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByTestId("invoice-status")).toHaveText("Paga");

  expect(await checkingBalance(page)).toBe(before - total);
});

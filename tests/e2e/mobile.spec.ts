import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/login";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const noHorizontalScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

test("phone: dashboard fits, quick entry sheet saves, invoices readable", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Painel" })).toBeVisible();
  await noHorizontalScroll(page);

  await page.goto("/lancamentos");
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "Lançar" }).click();
  const form = page.getByTestId("quick-entry-mobile");
  await form.getByLabel("Descrição").fill("padaria");
  await form.getByLabel("Valor").fill("12,50");
  await form.getByLabel("Categoria").selectOption({ label: "Mercado" });
  await form.getByRole("button", { name: "Lançar" }).click();
  await expect(page.getByText("Lançado")).toBeVisible();
  await expect(page.getByTestId("transaction-list").getByText("padaria")).toBeVisible();

  await page.goto("/faturas");
  await noHorizontalScroll(page);
  await page.goto("/contas");
  await noHorizontalScroll(page);
});

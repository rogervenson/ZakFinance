import { expect, test } from "vitest";
import { normalizeDescription, pickSuggestion, type SuggestHistory } from "@/domain/suggest";

const row = (description: string, categoryId: string, daysAgo: number, accountId = "card"): SuggestHistory => ({
  description,
  categoryId,
  accountId,
  projectId: null,
  date: new Date(Date.UTC(2026, 9, 31 - daysAgo)),
});

test("normalizes case, accents and spaces", () => {
  expect(normalizeDescription("  Farmácia   São João ")).toBe("farmacia sao joao");
});

test("exact match ignoring case", () => {
  expect(pickSuggestion([row("vitorino", "mercado", 1)], "Vitorino")).toEqual({ categoryId: "mercado", accountId: "card", projectId: null });
});

test("prefix match when there is no exact match", () => {
  expect(pickSuggestion([row("vitorino", "mercado", 1)], "vito")?.categoryId).toBe("mercado");
});

test("no match returns null", () => {
  expect(pickSuggestion([row("vitorino", "mercado", 1)], "xyz")).toBeNull();
});

test("most frequent category among the last 10 matches wins", () => {
  const history = [
    ...Array.from({ length: 7 }, (_, i) => row("pp", "saude", i + 3)),
    ...Array.from({ length: 3 }, (_, i) => row("pp", "despesas", i)),
  ];
  expect(pickSuggestion(history, "pp")?.categoryId).toBe("saude");
});

test("account comes from the most recent match of the winning category", () => {
  const history = [row("giassi", "mercado", 5, "card"), row("giassi", "mercado", 1, "checking")];
  expect(pickSuggestion(history, "giassi")?.accountId).toBe("checking");
});

test("a statement description that contains a known description is suggested", () => {
  expect(pickSuggestion([row("vitorino", "mercado", 1)], "MERCADO VITORINO")?.categoryId).toBe("mercado");
  expect(pickSuggestion([row("Felipe", "aluguel", 1)], "PIX RECEBIDO Luiz Felipe Rodrigues Pad")?.categoryId).toBe("aluguel");
});

test("containment needs at least 4 letters and prefers the longest known description", () => {
  expect(pickSuggestion([row("pp", "saude", 1)], "PIX ENVIADO APPLE")).toBeNull();
  const h = [row("mercado", "despesas", 1), row("mercado vitorino", "mercado", 1)];
  expect(pickSuggestion(h, "MERCADO VITORINO LTDA")?.categoryId).toBe("mercado");
});

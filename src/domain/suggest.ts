// Sugestão de categoria/conta a partir do histórico de descrições.

export interface SuggestHistory {
  description: string;
  categoryId: string | null;
  accountId: string;
  projectId: string | null;
  date: Date;
}

export interface Suggestion {
  categoryId: string;
  accountId: string;
  projectId: string | null;
}

/** "  Farmácia   São João " → "farmacia sao joao". */
export function normalizeDescription(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove o sufixo de parcela " (1/3)". */
const stripInstallment = (s: string) => s.replace(/\s*\(\d+\/\d+\)\s*$/, "");

/**
 * Correspondência exata (normalizada) vence; senão, prefixo. Entre as 10 mais recentes,
 * a categoria mais frequente vence; conta e projeto vêm da mais recente dessa categoria.
 */
export function pickSuggestion(history: SuggestHistory[], description: string): Suggestion | null {
  const target = normalizeDescription(description);
  if (!target) return null;
  const withCategory = history.filter((h) => h.categoryId);
  const norm = (h: SuggestHistory) => normalizeDescription(stripInstallment(h.description));
  let matches = withCategory.filter((h) => norm(h) === target);
  if (matches.length === 0) matches = withCategory.filter((h) => norm(h).startsWith(target));
  if (matches.length === 0) {
    // Descrição de extrato: "MERCADO VITORINO" contém o conhecido "vitorino".
    // Palavras inteiras, com pelo menos 4 letras; vence a descrição conhecida mais longa.
    const padded = ` ${target} `;
    const contained = withCategory.filter((h) => norm(h).length >= 4 && padded.includes(` ${norm(h)} `));
    const longest = Math.max(0, ...contained.map((h) => norm(h).length));
    matches = contained.filter((h) => norm(h).length === longest);
  }
  if (matches.length === 0) return null;

  const recent = [...matches].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);
  const counts = new Map<string, number>();
  for (const h of recent) counts.set(h.categoryId!, (counts.get(h.categoryId!) ?? 0) + 1);
  // Empate: a categoria do lançamento mais recente.
  let best = recent[0].categoryId!;
  for (const [id, n] of counts) if (n > (counts.get(best) ?? 0)) best = id;
  const latest = recent.find((h) => h.categoryId === best)!;
  return { categoryId: best, accountId: latest.accountId, projectId: latest.projectId };
}

// Dinheiro é sempre guardado em centavos inteiros.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos → "R$ 1.234,56". */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

/** Número vindo da planilha (float em reais) → centavos. */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Texto digitado → centavos. Aceita "1.234,56", "1234,56", "12,5", "R$ 50", "1234.56".
 * Retorna null para vazio, zero, negativo ou texto inválido.
 */
export function parseBRL(input: string): number | null {
  let s = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s || s.startsWith("-")) return null;
  // Digitação comum no celular: ",50" e "10," / "10.".
  if (/^[.,]\d{1,2}$/.test(s)) s = "0" + s;
  if (/^\d+[.,]$/.test(s)) s = s.slice(0, -1);
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 ? cents : null;
}

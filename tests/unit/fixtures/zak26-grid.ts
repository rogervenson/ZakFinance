// Grades pequenas no formato da planilha Zak26, para os testes do importador.
import type { Cell, Grid } from "@/domain/zak26/grid";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Cria uma grade a partir de referências A1: { "A3": "SMA:", "B3": 4818.42 }. */
export function grid(name: string, cells: Record<string, Cell>): Grid {
  const map = new Map<string, Cell>();
  let rows = 0;
  let cols = 0;
  for (const [ref, value] of Object.entries(cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
    const col = m[1].split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const row = Number(m[2]);
    map.set(`${row}:${col}`, value);
    rows = Math.max(rows, row);
    cols = Math.max(cols, col);
  }
  return { name, rowCount: rows, colCount: cols, get: (r, c) => map.get(`${r}:${c}`) ?? null };
}

/** Uma aba mensal mínima com os cabeçalhos e totais nas linhas reais da planilha. */
export function monthSheet(name: string, extra: Record<string, Cell> = {}, totals: Record<number, number> = {}): Grid {
  const headers: Record<number, string> = {
    1: "Receitas",
    12: "Dividendos",
    21: "Rembolso",
    29: "Kilometragem",
    37: "Rove",
    42: "Investimento",
    51: "Mercado Crédito",
    97: "Mercado Débito",
    110: "Despesas Crédito",
    140: "Despesas Débito",
    170: "Saúde Crédito",
    191: "Saúde Débito",
    204: "Rembolso Crédito",
    222: "Rembolso Débito",
    241: "Carro Crédito",
    259: "Carro Débito",
    278: "Agro Crédito",
    296: "Agro Débito",
    315: "Sotão Crédito",
    333: "Sotão Débito",
  };
  const totalRows = [11, 20, 28, 36, 41, 50, 96, 109, 139, 169, 190, 203, 221, 240, 258, 277, 295, 314, 332, 351];
  const cells: Record<string, Cell> = { A2: "Item", B2: "Valor", C2: "Data", A52: "Item", B52: "Custo", C52: "Data" };
  for (const [row, text] of Object.entries(headers)) cells[`A${row}`] = text;
  for (const row of totalRows) {
    cells[`B${row}`] = "Total:";
    cells[`C${row}`] = totals[row] ?? 0;
  }
  return grid(name, { ...cells, ...extra });
}

export const OUT = monthSheet(
  "Out",
  {
    A3: "SMA:",
    B3: 4818.42,
    C3: d("2026-10-05"),
    A5: "Felipe",
    B5: 907.2,
    C5: d("2026-10-05"),
    A13: "Remuneração",
    B13: 0.85,
    C13: d("2026-10-07"),
    A43: "poupanca",
    B43: 200,
    C43: d("2026-10-13"),
    A53: "vitorino",
    B53: 538.53,
    C53: d("2026-09-16"),
    A54: "tokyo",
    B54: 265.92,
    A55: "estranho",
    B55: 10,
    C55: "28/02/0202",
    A98: "celesc",
    B98: 106.24,
    C98: d("2026-10-20"),
    A223: "GISELE",
    B223: 579,
    C223: d("2026-10-08"),
    A316: "meli lustres",
    B316: 37.91,
    C316: d("2026-09-16"),
    P55: "gisele",
    Q55: 510,
    R55: d("2025-01-06"),
  },
  { 11: 5725.62, 20: 0.85, 50: 200, 96: 900, 109: 106.24, 240: 579, 332: 37.91 },
);

export const geral = grid("Geral", {
  A7: "Tickets",
  B7: 913,
  C7: 954,
  K7: 954,
  L7: 954,
  A22: "Saldo Anterior:",
  B22: 6502.63,
  A27: "Saldo CC:",
  B27: 3114.31,
  K27: 8782.43,
  A28: "Poupança:",
  K28: 1224.81,
  A30: "Ações:",
  K30: 63954.03,
  A32: "Etf:",
  K32: 6531,
  A33: "Previdência:",
  K33: 329803.75,
});

export const inv = grid("Inv", {
  B1: "Qtde",
  A2: "CSMG3",
  B2: 8,
  C2: 17.75,
  K2: 129.74,
  A3: d("2024-06-28"),
  B3: -300,
  A10: "BBAS3",
  B10: 1324,
  C10: 24,
  K10: 2174.51,
  D15: "Total Ações",
  A18: "TRXF11",
  B18: 14,
  C18: 104.08,
  A20: "KNCR11",
  B20: 20,
  C20: 104.7,
  D23: "Total Fii",
  A25: "IVVB11",
  B25: 14,
  C25: 378.8,
  A38: "IBOV",
});

/** Linhas de crédito repetidas em vários meses (parcela relançada à mão). */
export function sctSheet(name: string): Grid {
  return monthSheet(name, { A172: "SCT", B172: 933.33, C172: d("2025-11-20") }, { 190: 933.33 });
}

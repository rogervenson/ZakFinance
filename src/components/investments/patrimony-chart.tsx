"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/money";
import { monthLabel } from "@/lib/months";

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Patrimônio total por mês: uma série, linha de 2px, sem legenda (o título diz o que é). */
export function PatrimonyChart({ data }: { data: { month: string; totalCents: number }[] }) {
  if (data.length < 2) return null;
  return (
    <div className="h-56 w-full" role="img" aria-label="Evolução do patrimônio total">
      <ResponsiveContainer>
        <LineChart data={data.map((d) => ({ label: monthLabel(d.month), total: d.totalCents / 100 }))} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => compact.format(v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 13 }}
            formatter={(v) => [formatBRL(Math.round(Number(v) * 100)), "Total"]}
          />
          <Line isAnimationActive={false} type="monotone" dataKey="total" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--chart-1)" }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

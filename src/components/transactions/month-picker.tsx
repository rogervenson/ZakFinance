"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonthKey, monthLabel } from "@/lib/months";
import { Button } from "@/components/ui/button";

/** Navega entre meses mudando o parâmetro `mes` da URL. */
export function MonthPicker({ month, param = "mes" }: { month: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const go = (n: number) => {
    const params = new URLSearchParams(search.toString());
    params.set(param, addMonthKey(month, n));
    params.delete("pagina");
    router.push(`${pathname}?${params.toString()}`);
  };
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => go(-1)}>
        <ChevronLeft />
      </Button>
      <span className="min-w-24 text-center text-sm font-medium tabular-nums">{monthLabel(month)}</span>
      <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => go(1)}>
        <ChevronRight />
      </Button>
    </div>
  );
}

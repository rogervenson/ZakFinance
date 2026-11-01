"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TransactionForm } from "./transaction-form";
import type { EntryOptions } from "./types";

/** Linha de lançamento rápido no desktop; botão "+ Lançar" com painel no celular. */
export function QuickEntry({ options }: { options: EntryOptions }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card className="hidden md:block">
        <CardContent>
          <TransactionForm options={options} layout="row" />
        </CardContent>
      </Card>
      <div className="md:hidden">
        <Button className="w-full" onClick={() => setOpen(true)}>
          <Plus />
          Lançar
        </Button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto px-4 pb-6">
            <SheetHeader className="px-0">
              <SheetTitle>Novo lançamento</SheetTitle>
            </SheetHeader>
            <TransactionForm options={options} layout="stacked" onDone={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

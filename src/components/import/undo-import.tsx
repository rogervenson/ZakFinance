"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { undoImportAction } from "@/server/actions/import";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function UndoImport({ count }: { count: number }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Desfazer importação</CardTitle>
        <p className="text-sm text-muted-foreground">
          Remove os {count} lançamentos vindos da planilha, o patrimônio e a carteira importados. O que você lançou à mão continua. Digite DESFAZER para
          confirmar.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Input aria-label="Confirmação" value={text} onChange={(e) => setText(e.target.value)} className="w-40" placeholder="DESFAZER" />
        <Button
          variant="destructive"
          disabled={pending || text.trim().toUpperCase() !== "DESFAZER"}
          onClick={() =>
            startTransition(async () => {
              const res = await undoImportAction(text);
              if (!res.ok) toast.error(res.error);
              else {
                toast.success("Importação desfeita.");
                setText("");
              }
            })
          }
        >
          Desfazer importação
        </Button>
      </CardContent>
    </Card>
  );
}

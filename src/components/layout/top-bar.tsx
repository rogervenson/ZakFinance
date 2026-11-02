"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function TopBar({ todayLabel }: { todayLabel: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-card/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6">
      <SidebarTrigger className="-ml-1.5" aria-label="Abrir ou fechar o menu" />
      <Separator orientation="vertical" className="mr-1 h-4!" />
      <span className="text-xs tracking-wide text-muted-foreground uppercase">{todayLabel}</span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Alternar tema" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <Sun className="hidden dark:block" />
          <Moon className="dark:hidden" />
        </Button>
      </div>
    </header>
  );
}

import { Landmark } from "lucide-react";

export const APP_NAME = "ZakFinance";

export function LogoMark() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-primary text-primary-foreground">
      <Landmark className="size-4" />
    </span>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
    </span>
  );
}

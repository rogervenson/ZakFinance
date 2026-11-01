"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, FileSpreadsheet, Landmark, LayoutDashboard, ListPlus, Tags, type LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAME, LogoMark } from "./logo";
import { UserMenu } from "./user-menu";

type Item = { href: string; label: string; icon: LucideIcon };

const ITEMS: Item[] = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: ListPlus },
  { href: "/faturas", label: "Faturas", icon: CreditCard },
  { href: "/contas", label: "Contas", icon: Landmark },
  { href: "/categorias", label: "Categorias e projetos", icon: Tags },
  { href: "/importar", label: "Importar planilha", icon: FileSpreadsheet },
];

export function AppSidebar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isActive = (item: Item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center">
        <Link href="/" className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:px-0">
          <LogoMark />
          <span className="truncate text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">{APP_NAME}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.label}>
                    <Link href={item.href} onClick={() => setOpenMobile(false)}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

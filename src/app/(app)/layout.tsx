import { cookies } from "next/headers";
import { requireUser } from "@/server/auth/actor";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const jar = await cookies();
  const defaultOpen = jar.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={{ name: user.name, email: user.email }} />
      <SidebarInset className="min-w-0">
        <TopBar />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

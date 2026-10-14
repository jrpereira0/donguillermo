import { AppShell } from "@/components/app-shell";
import { requireNetworkAdmin } from "@/lib/auth/guards";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // 2ª barreira: o proxy só confere se há sessão; o PAPEL é validado aqui.
  const ctx = await requireNetworkAdmin();
  return (
    <AppShell email={ctx.email} role="admin_rede" scope="Rede Don Guillermo">
      {children}
    </AppShell>
  );
}

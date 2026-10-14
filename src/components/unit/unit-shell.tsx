import { Suspense } from "react";
import { brand } from "@/config/brand";
import type { AppRole } from "@/lib/auth/roles";
import type { NavItem } from "./nav";
import { UnitSidebar } from "./unit-sidebar";

type Props = {
  email: string;
  role: AppRole;
  unitName: string;
  items: NavItem[];
  children: React.ReactNode;
};

/**
 * Moldura das telas da unidade: menu lateral à esquerda + conteúdo.
 * O menu usa `usePathname` (marca o item ativo); com cacheComponents isso exige
 * <Suspense>, por isso o fallback com a mesma largura (sem "pulo" de layout).
 */
export function UnitShell({ email, role, unitName, items, children }: Props) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <Suspense
        fallback={<aside className="hidden w-64 shrink-0 border-r border-border bg-[#141414] lg:block" />}
      >
        <UnitSidebar
          items={items}
          unitName={unitName}
          email={email}
          logoSrc={brand.logoSquareSrc}
          brandName={brand.name}
          backHref={role === "admin_rede" ? "/admin" : undefined}
        />
      </Suspense>
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}

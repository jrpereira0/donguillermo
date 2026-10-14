import { navItemsFor } from "@/components/unit/nav";
import { UnitShell } from "@/components/unit/unit-shell";
import { requireUnit } from "@/lib/auth/guards";
import { isNetworkAdmin, type AppRole } from "@/lib/auth/roles";

export const instant = false;

export default async function UnitLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { ctx, unit } = await requireUnit(slug);

  // Papel exibido no menu: o do usuário nesta unidade (admin_rede se for o dono).
  const roleHere: AppRole = isNetworkAdmin(ctx.memberships)
    ? "admin_rede"
    : (ctx.memberships.find((m) => m.unit?.slug === slug)?.role ?? "barbeiro");

  return (
    <UnitShell
      email={ctx.email}
      role={roleHere}
      unitName={unit.name}
      items={navItemsFor(ctx.memberships, slug)}
    >
      {children}
    </UnitShell>
  );
}

import { canAccessUnitArea, isNetworkAdmin, type Membership, type UnitArea } from "@/lib/auth/roles";

export type NavIcon = "agenda" | "profissionais" | "servicos" | "produtos" | "caixa" | "configuracoes";

export type NavItem = { href: string; label: string; icon: NavIcon };

const RECEPTION_ITEMS: { area: UnitArea; label: string; icon: NavIcon }[] = [
  { area: "agenda", label: "Agenda", icon: "agenda" },
  { area: "profissionais", label: "Profissionais", icon: "profissionais" },
  { area: "servicos", label: "Serviços", icon: "servicos" },
  { area: "produtos", label: "Produtos", icon: "produtos" },
  { area: "caixa", label: "Caixa", icon: "caixa" },
  { area: "configuracoes", label: "Configurações", icon: "configuracoes" },
];

/**
 * Itens do menu lateral da unidade `slug` para este usuário.
 * Recepção e admin da rede: todas as áreas da recepção. Barbeiro: só "Minha agenda".
 * (Esconder o item é só conveniência: cada página valida o acesso no servidor.)
 */
export function navItemsFor(memberships: Membership[], slug: string): NavItem[] {
  const base = `/u/${slug}`;
  const items: NavItem[] = RECEPTION_ITEMS.filter((i) =>
    canAccessUnitArea(memberships, slug, i.area),
  ).map((i) => ({ href: `${base}/${i.area}`, label: i.label, icon: i.icon }));

  const isBarberHere = memberships.some((m) => m.role === "barbeiro" && m.unit?.slug === slug);
  if (isBarberHere && !isNetworkAdmin(memberships)) {
    items.push({ href: `${base}/minha-agenda`, label: "Minha agenda", icon: "agenda" });
  }
  return items;
}

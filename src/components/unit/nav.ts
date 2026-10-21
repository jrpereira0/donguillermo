import { canAccessUnitArea, isNetworkAdmin, type Membership, type UnitArea } from "@/lib/auth/roles";

export type NavIcon = "agenda" | "clientes" | "profissionais" | "servicos" | "produtos" | "pacotes" | "caixa" | "comissoes" | "configuracoes";

export type NavItem = { href: string; label: string; icon: NavIcon; group: string };

/**
 * Menu da unidade, na ordem do dia a dia:
 * o que se usa toda hora (operação), cadastros, catálogo e ajustes da unidade.
 */
const RECEPTION_ITEMS: { area: UnitArea; label: string; icon: NavIcon; group: string }[] = [
  { area: "agenda", label: "Agenda", icon: "agenda", group: "Operação" },
  { area: "caixa", label: "Caixa", icon: "caixa", group: "Operação" },
  { area: "comissoes", label: "Comissões", icon: "comissoes", group: "Operação" },
  { area: "clientes", label: "Clientes", icon: "clientes", group: "Cadastros" },
  { area: "profissionais", label: "Profissionais", icon: "profissionais", group: "Cadastros" },
  { area: "servicos", label: "Serviços", icon: "servicos", group: "Catálogo" },
  { area: "produtos", label: "Produtos", icon: "produtos", group: "Catálogo" },
  { area: "pacotes", label: "Pacotes", icon: "pacotes", group: "Catálogo" },
  { area: "configuracoes", label: "Configurações", icon: "configuracoes", group: "Unidade" },
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
  ).map((i) => ({ href: `${base}/${i.area}`, label: i.label, icon: i.icon, group: i.group }));

  const isBarberHere = memberships.some((m) => m.role === "barbeiro" && m.unit?.slug === slug);
  if (isBarberHere && !isNetworkAdmin(memberships)) {
    items.push({ href: `${base}/minha-agenda`, label: "Minha agenda", icon: "agenda", group: "Operação" });
  }
  return items;
}

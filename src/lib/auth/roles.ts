/**
 * Papéis e destinos — lógica PURA (sem banco, sem Next), fácil de testar.
 * A decisão de "para onde cada papel vai" mora aqui e só aqui.
 */
export type AppRole = "admin_rede" | "recepcao" | "barbeiro";

export type UnitRef = { id: string; slug: string; name: string };

/** Vínculo ativo do usuário. `unit` é null apenas para admin_rede. */
export type Membership = { role: AppRole; unit: UnitRef | null };

export type Destination = {
  href: string;
  role: AppRole;
  /** Título do cartão na tela de escolha. */
  title: string;
  /** Subtítulo (nome da unidade, quando houver). */
  subtitle?: string;
};

export const ROLE_LABEL: Record<AppRole, string> = {
  admin_rede: "Administrador da rede",
  recepcao: "Recepção",
  barbeiro: "Barbeiro",
};

/** Áreas de unidade e quais papéis podem entrar nelas. */
export type UnitArea =
  | "agenda"
  | "clientes"
  | "profissionais"
  | "servicos"
  | "produtos"
  | "caixa"
  | "comissoes"
  | "configuracoes"
  | "minha-agenda";

export const AREA_ROLE: Record<UnitArea, AppRole> = {
  agenda: "recepcao",
  clientes: "recepcao",
  profissionais: "recepcao",
  servicos: "recepcao",
  produtos: "recepcao",
  caixa: "recepcao",
  comissoes: "recepcao",
  configuracoes: "recepcao",
  "minha-agenda": "barbeiro",
};

export function destinationOf(m: Membership): Destination | null {
  if (m.role === "admin_rede") {
    return { href: "/admin", role: m.role, title: "Painel da rede" };
  }
  if (!m.unit) return null; // vínculo inconsistente: ignora (defesa extra)
  if (m.role === "recepcao") {
    return {
      href: `/u/${m.unit.slug}/agenda`,
      role: m.role,
      title: "Agenda da recepção",
      subtitle: m.unit.name,
    };
  }
  return {
    href: `/u/${m.unit.slug}/minha-agenda`,
    role: m.role,
    title: "Minha agenda",
    subtitle: m.unit.name,
  };
}

/** Todos os destinos possíveis, sem repetição, na ordem admin → recepção → barbeiro. */
export function destinationsFor(memberships: Membership[]): Destination[] {
  const order: AppRole[] = ["admin_rede", "recepcao", "barbeiro"];
  const seen = new Set<string>();
  return [...memberships]
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .map(destinationOf)
    .filter((d): d is Destination => d !== null)
    .filter((d) => (seen.has(d.href) ? false : (seen.add(d.href), true)));
}

/** Para onde mandar o usuário logo após entrar. */
export function resolveHome(memberships: Membership[]):
  | { kind: "none" }
  | { kind: "single"; href: string }
  | { kind: "choose" } {
  const dests = destinationsFor(memberships);
  if (dests.length === 0) return { kind: "none" };
  if (dests.length === 1) return { kind: "single", href: dests[0]!.href };
  return { kind: "choose" };
}

export function isNetworkAdmin(memberships: Membership[]): boolean {
  return memberships.some((m) => m.role === "admin_rede");
}

/**
 * Pode entrar na área `area` da unidade `slug`?
 * - O papel exigido pela área nessa unidade; ou
 * - admin_rede (dono da rede acessa qualquer unidade).
 */
export function canAccessUnitArea(
  memberships: Membership[],
  slug: string,
  area: UnitArea,
): boolean {
  if (isNetworkAdmin(memberships)) return true;
  const needed = AREA_ROLE[area];
  return memberships.some((m) => m.role === needed && m.unit?.slug === slug);
}

/** Pode ver a unidade `slug` (qualquer papel nela, ou admin da rede)? */
export function canSeeUnit(memberships: Membership[], slug: string): boolean {
  if (isNetworkAdmin(memberships)) return true;
  return memberships.some((m) => m.unit?.slug === slug);
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { packageServiceShareCents } from "@/lib/packages/math";
import { getBarber, listBarbers } from "@/lib/barbers/queries";
import {
  barberProductsPctFor,
  barberServicesCommissionCents,
  barberServicesPctFor,
  servicesCommissionCents,
  type CommissionBracket,
} from "./brackets";

/** Tabela progressiva vigente (rede), da menor para a maior faixa. */
export async function listCommissionBrackets(): Promise<CommissionBracket[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_brackets")
    .select("min_cents, max_cents, pct")
    .order("min_cents", { ascending: true })
    .returns<{ min_cents: number; max_cents: number | null; pct: number | string }[]>();
  if (error) {
    console.error("[comissoes] brackets:", error.code);
    return [];
  }
  return (data ?? []).map((r) => ({ minCents: r.min_cents, maxCents: r.max_cents, pct: Number(r.pct) }));
}

/** % de produtos da rede (linha única definida pelo admin); 0 se ainda não definido. */
export async function getNetworkProductsPct(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_settings")
    .select("products_pct")
    .eq("id", true)
    .maybeSingle<{ products_pct: number | string }>();
  if (error) {
    console.error("[comissoes] settings:", error.code);
    return 0;
  }
  return Number(data?.products_pct ?? 0);
}

/** % próprio do profissional vindo do banco (string/number) ou `null` = segue a rede. */
const ownPct = (v: number | string | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

const TZ = "America/Sao_Paulo";

/**
 * Fatia [fromISO, toISO) pelos meses de São Paulo: a faixa de cada barbeiro é
 * definida pelo faturamento de serviços DELE EM CADA MÊS, então o cálculo é
 * feito mês a mês (o período da tela pode cruzar meses).
 */
function monthSlices(fromISO: string, toISO: string): { from: string; to: string }[] {
  const start = fromISO.slice(0, 10);
  const end = toISO.slice(0, 10);
  const slices: { from: string; to: string }[] = [];
  let cur = start;
  while (cur < end) {
    const [y, m] = cur.split("-").map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const sliceEnd = nextMonth < end ? nextMonth : end;
    slices.push({ from: `${cur}T00:00:00-03:00`, to: `${sliceEnd}T00:00:00-03:00` });
    cur = sliceEnd;
  }
  return slices;
}

const monthLabelOf = (key: string) => {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: TZ }).format(
    new Date(`${key}-02T12:00:00`),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
};

export type CommissionRow = {
  barberId: string;
  name: string;
  jobTitle: string;
  isActive: boolean;
  pctServices: number;
  pctProducts: number;
  servicesCents: number;
  productsCents: number;
  commissionServicesCents: number;
  commissionProductsCents: number;
  tipsCents: number;
  ticketsCount: number;
  appointmentsDone: number;
  /** Comissão (serviços + produtos), sem gorjeta. */
  commissionCents: number;
  /** Comissão + gorjetas: o que o barbeiro leva no período. */
  totalCents: number;
  productionCents: number;
};

type SummaryRpcRow = {
  barber_id: string;
  services_cents: number;
  products_cents: number;
  tickets_count: number;
  appointments_done: number;
  tips_cents: number;
};

const pctOf = (cents: number, pct: number) => Math.round((cents * pct) / 100);

type BarberAccum = {
  servicesCents: number;
  productsCents: number;
  tipsCents: number;
  ticketsCount: number;
  appointmentsDone: number;
  commissionServicesCents: number;
};

/**
 * Resumo de comissões de todos os barbeiros da unidade no período [from, to).
 * Serviços: % próprio do profissional quando definido; senão, a tabela
 * progressiva da rede aplicada mês a mês sobre o faturamento dele no mês.
 * Produtos: % próprio quando definido; senão, o % de produtos da rede.
 */
export async function listCommissionSummary(unitId: string, from: string, to: string): Promise<CommissionRow[]> {
  const supabase = await createClient();
  const slices = monthSlices(from, to);
  const [barbers, brackets, networkProductsPct, sliceResults] = await Promise.all([
    listBarbers(unitId),
    listCommissionBrackets(),
    getNetworkProductsPct(),
    Promise.all(slices.map((s) => supabase.rpc("commission_summary", { p_unit: unitId, p_from: s.from, p_to: s.to }))),
  ]);

  const acc = new Map<string, BarberAccum>();
  const blank = (): BarberAccum => ({
    servicesCents: 0,
    productsCents: 0,
    tipsCents: 0,
    ticketsCount: 0,
    appointmentsDone: 0,
    commissionServicesCents: 0,
  });
  for (const res of sliceResults) {
    if (res.error) console.error("[comissoes] summary:", res.error.code);
    for (const r of (res.data ?? []) as SummaryRpcRow[]) {
      const a = acc.get(r.barber_id) ?? blank();
      const sliceServices = Number(r.services_cents ?? 0);
      a.servicesCents += sliceServices;
      a.productsCents += Number(r.products_cents ?? 0);
      a.tipsCents += Number(r.tips_cents ?? 0);
      a.ticketsCount += Number(r.tickets_count ?? 0);
      a.appointmentsDone += Number(r.appointments_done ?? 0);
      acc.set(r.barber_id, a);
    }
  }
  // A comissão de serviços de cada mês usa a regra daquele mês (2ª passada,
  // porque a faixa depende do total do mês de cada barbeiro).
  for (const res of sliceResults) {
    for (const r of (res.data ?? []) as SummaryRpcRow[]) {
      const a = acc.get(r.barber_id);
      if (!a) continue;
      const barber = barbers.find((b) => b.id === r.barber_id);
      a.commissionServicesCents += barberServicesCommissionCents(
        brackets,
        Number(r.services_cents ?? 0),
        ownPct(barber?.commission_services_pct),
      );
    }
  }

  const rows: CommissionRow[] = barbers.map((b) => {
    const s = acc.get(b.id);
    const servicesCents = s?.servicesCents ?? 0;
    const productsCents = s?.productsCents ?? 0;
    const commissionServices = s?.commissionServicesCents ?? 0;
    const commissionProductsCents = pctOf(productsCents, barberProductsPctFor(ownPct(b.commission_products_pct), networkProductsPct));
    const tipsCents = s?.tipsCents ?? 0;
    const commissionCents = commissionServices + commissionProductsCents;
    // % efetivo do período (para exibição): comissão ÷ faturamento de serviços.
    const effectivePct =
      servicesCents > 0
        ? Math.round((commissionServices / servicesCents) * 10_000) / 100
        : barberServicesPctFor(brackets, 0, ownPct(b.commission_services_pct));
    return {
      barberId: b.id,
      name: b.display_name,
      jobTitle: b.job_title,
      isActive: b.is_active,
      pctServices: effectivePct,
      pctProducts: barberProductsPctFor(ownPct(b.commission_products_pct), networkProductsPct),
      servicesCents,
      productsCents,
      commissionServicesCents: commissionServices,
      commissionProductsCents,
      tipsCents,
      ticketsCount: s?.ticketsCount ?? 0,
      appointmentsDone: s?.appointmentsDone ?? 0,
      commissionCents,
      totalCents: commissionCents + tipsCents,
      productionCents: servicesCents + productsCents,
    };
  });
  // Quem mais leva no período primeiro; sem movimento vai para o fim, por nome.
  return rows.sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name));
}

export type BarberTicketLine = { name: string; kind: string; quantity: number; totalCents: number; fromPackage: boolean };
export type BarberTicket = {
  id: string;
  customerName: string;
  /** Quando o atendimento começou (a comissão é deste dia, não do recebimento). */
  openedAt: string;
  items: BarberTicketLine[];
  servicesCents: number;
  productsCents: number;
  commissionCents: number;
  tipCents: number;
};
export type BarberTopItem = { name: string; kind: string; count: number; totalCents: number; fromPackage: boolean };

export type BarberMonthRow = {
  /** "2026-10" */
  key: string;
  label: string;
  servicesCents: number;
  /** % da faixa daquele mês. */
  pct: number;
  commissionCents: number;
};

export type BarberCommissionDetail = {
  barber: {
    id: string;
    name: string;
    fullName: string;
    jobTitle: string;
    isActive: boolean;
    phone: string | null;
    /** % de produtos vigente (o próprio ou o da rede). */
    pctProducts: number;
    /** % próprio de serviços do profissional; null = tabela da rede. */
    servicesOwnPct: number | null;
  };
  tickets: BarberTicket[];
  topItems: BarberTopItem[];
  servicesCents: number;
  productsCents: number;
  servicesCommissionCents: number;
  productsCommissionCents: number;
  commissionCents: number;
  tipsCents: number;
  appointmentsDone: number;
  /** Quebra por mês (a faixa é mensal). */
  months: BarberMonthRow[];
  /** Faixa de percentuais da tabela, ex.: "25% a 35%"; null sem tabela (vale o % do cadastro). */
  bracketRange: string | null;
};

type DetailItem = {
  name: string;
  kind: string;
  quantity: number;
  unit_price_cents: number;
  customer_package_id: string | null;
  customer_packages:
    | { price_cents: number; customer_package_items: { quantity_total: number }[] | null }
    | { price_cents: number; customer_package_items: { quantity_total: number }[] | null }[]
    | null;
};

/** Produção do item: serviço de pacote vale a cota (preço do pacote ÷ quantidade). */
function itemProductionCents(i: DetailItem): number {
  if (i.kind !== "servico" && i.kind !== "produto") return 0;
  if (i.kind === "produto" || !i.customer_package_id) return i.quantity * i.unit_price_cents;
  const cp = Array.isArray(i.customer_packages) ? i.customer_packages[0] : i.customer_packages;
  if (!cp) return i.quantity * i.unit_price_cents;
  const count = (cp.customer_package_items ?? []).reduce((n, x) => n + x.quantity_total, 0);
  return i.quantity * packageServiceShareCents(cp.price_cents, count);
}

/** Detalhe de um barbeiro no período: comandas em que ele vendeu, itens em destaque e totais. */
export async function getBarberCommissionDetail(
  unitId: string,
  barberId: string,
  from: string,
  to: string,
): Promise<BarberCommissionDetail | null> {
  const barber = await getBarber(unitId, barberId);
  if (!barber) return null;
  const supabase = await createClient();
  // % próprio do profissional (null = segue a rede) e % de produtos da rede.
  const ownServices = ownPct(barber.commission_services_pct);
  const ownProducts = ownPct(barber.commission_products_pct);
  const networkProductsPct = await getNetworkProductsPct();
  const pctP = barberProductsPctFor(ownProducts, networkProductsPct);

  // A comissão é do dia do ATENDIMENTO (attended_on), não do dia em que a
  // comanda foi recebida: comanda de ontem recebida hoje entra em ontem.
  const deDay = from.slice(0, 10);
  const ateDay = to.slice(0, 10);
  const [ticketsRes, tipsRes, apptRes, brackets] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        "id, customer_name, opened_at, attended_on, ticket_items!inner(name, kind, quantity, unit_price_cents, barber_id, customer_package_id, customer_packages(price_cents, customer_package_items(quantity_total)))",
      )
      .eq("unit_id", unitId)
      .eq("status", "fechada")
      .eq("ticket_items.barber_id", barberId)
      .in("ticket_items.kind", ["servico", "produto"])
      .gte("attended_on", deDay)
      .lt("attended_on", ateDay)
      .order("opened_at", { ascending: false })
      .limit(300)
      .returns<
        {
          id: string;
          customer_name: string;
          opened_at: string;
          attended_on: string;
          ticket_items: DetailItem[];
        }[]
      >(),
    supabase
      .from("ticket_tips")
      .select("ticket_id, amount_cents, tickets!inner(id, attended_on, status, unit_id)")
      .eq("unit_id", unitId)
      .eq("barber_id", barberId)
      .returns<{ ticket_id: string; amount_cents: number; tickets: { attended_on: string; status: string } }[]>(),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .eq("barber_id", barberId)
      .eq("status", "concluido")
      .gte("starts_at", from)
      .lt("starts_at", to),
    listCommissionBrackets(),
  ]);
  if (ticketsRes.error) console.error("[comissoes] detail tickets:", ticketsRes.error.code);

  // Gorjeta deste barbeiro só entra se o atendimento caiu dentro do período.
  const tipByTicket = new Map<string, number>();
  for (const t of tipsRes.data ?? []) {
    const tk = Array.isArray(t.tickets) ? t.tickets[0] : t.tickets;
    if (!tk || tk.status !== "fechada") continue;
    if (tk.attended_on < deDay || tk.attended_on >= ateDay) continue;
    tipByTicket.set(t.ticket_id, (tipByTicket.get(t.ticket_id) ?? 0) + t.amount_cents);
  }

  // 1ª passada: faturamento de serviços por mês do atendimento (a faixa depende do mês).
  const monthServices = new Map<string, number>();
  for (const t of ticketsRes.data ?? []) {
    const s = t.ticket_items.reduce((n, i) => n + (i.kind === "servico" ? itemProductionCents(i) : 0), 0);
    const key = t.attended_on.slice(0, 7);
    monthServices.set(key, (monthServices.get(key) ?? 0) + s);
  }
  const pctByMonth = new Map(
    [...monthServices.entries()].map(([key, total]) => [key, barberServicesPctFor(brackets, total, ownServices)]),
  );

  let servicesCents = 0;
  let productsCents = 0;
  const top = new Map<string, BarberTopItem>();
  const tickets: BarberTicket[] = (ticketsRes.data ?? []).map((t) => {
    let s = 0;
    let p = 0;
    const items: BarberTicketLine[] = t.ticket_items.map((i) => {
      const total = itemProductionCents(i);
      // Item "pacote" é a VENDA do pacote: não é produção de ninguém. Comissão
      // só nasce quando o cliente USA cada serviço (item servico pelo pacote).
      if (i.kind === "produto") p += total;
      else if (i.kind === "servico") s += total;
      const fromPackage = i.kind === "servico" && !!i.customer_package_id;
      // Uso de pacote conta à parte: mesmo nome de serviço, outra linha de faturamento.
      const label = fromPackage ? `${i.name} · pacote` : i.name;
      if (i.kind === "pacote") return { name: label, kind: i.kind, quantity: i.quantity, totalCents: 0, fromPackage };
      const key = `${i.kind}:${fromPackage ? "pacote:" : ""}${i.name}`;
      const cur = top.get(key) ?? { name: label, kind: i.kind, count: 0, totalCents: 0, fromPackage };
      cur.count += i.quantity;
      cur.totalCents += total;
      top.set(key, cur);
      return { name: label, kind: i.kind, quantity: i.quantity, totalCents: total, fromPackage };
    });
    servicesCents += s;
    productsCents += p;
    const monthPct = pctByMonth.get(t.attended_on.slice(0, 7)) ?? 0;
    return {
      id: t.id,
      customerName: t.customer_name,
      openedAt: t.opened_at,
      items,
      servicesCents: s,
      productsCents: p,
      commissionCents: pctOf(s, monthPct) + pctOf(p, pctP),
      tipCents: tipByTicket.get(t.id) ?? 0,
    };
  });

  const months: BarberMonthRow[] = [...monthServices.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, total]) => ({
      key,
      label: monthLabelOf(key),
      servicesCents: total,
      pct: pctByMonth.get(key) ?? 0,
      commissionCents: barberServicesCommissionCents(brackets, total, ownServices),
    }));
  const servicesCommission = months.reduce((a, m) => a + m.commissionCents, 0);
  const productsCommission = pctOf(productsCents, pctP);
  const pctValues = brackets.map((b) => b.pct);
  const tipsCents = tickets.reduce((a, t) => a + t.tipCents, 0);
  return {
    barber: {
      id: barber.id,
      name: barber.display_name,
      fullName: barber.full_name,
      jobTitle: barber.job_title,
      isActive: barber.is_active,
      phone: barber.phone,
      pctProducts: pctP,
      servicesOwnPct: ownServices,
    },
    tickets,
    topItems: [...top.values()].sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name)),
    servicesCents,
    productsCents,
    servicesCommissionCents: servicesCommission,
    productsCommissionCents: productsCommission,
    commissionCents: servicesCommission + productsCommission,
    tipsCents,
    appointmentsDone: apptRes.count ?? 0,
    months,
    bracketRange: pctValues.length
      ? `${String(Math.min(...pctValues)).replace(".", ",")}% a ${String(Math.max(...pctValues)).replace(".", ",")}%`
      : null,
  };
}

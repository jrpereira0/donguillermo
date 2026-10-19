import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getBarber, listBarbers } from "@/lib/barbers/queries";

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

/** Resumo de comissões de todos os barbeiros da unidade no período [from, to). */
export async function listCommissionSummary(unitId: string, from: string, to: string): Promise<CommissionRow[]> {
  const supabase = await createClient();
  const [barbers, rpc] = await Promise.all([
    listBarbers(unitId),
    supabase.rpc("commission_summary", { p_unit: unitId, p_from: from, p_to: to }),
  ]);
  if (rpc.error) console.error("[comissoes] summary:", rpc.error.code);
  const byBarber = new Map<string, SummaryRpcRow>(
    ((rpc.data ?? []) as SummaryRpcRow[]).map((r) => [r.barber_id, r]),
  );

  const rows: CommissionRow[] = barbers.map((b) => {
    const s = byBarber.get(b.id);
    const servicesCents = Number(s?.services_cents ?? 0);
    const productsCents = Number(s?.products_cents ?? 0);
    const commissionServicesCents = pctOf(servicesCents, Number(b.commission_services_pct));
    const commissionProductsCents = pctOf(productsCents, Number(b.commission_products_pct));
    const tipsCents = Number(s?.tips_cents ?? 0);
    const commissionCents = commissionServicesCents + commissionProductsCents;
    return {
      barberId: b.id,
      name: b.display_name,
      jobTitle: b.job_title,
      isActive: b.is_active,
      pctServices: Number(b.commission_services_pct),
      pctProducts: Number(b.commission_products_pct),
      servicesCents,
      productsCents,
      commissionServicesCents,
      commissionProductsCents,
      tipsCents,
      ticketsCount: Number(s?.tickets_count ?? 0),
      appointmentsDone: Number(s?.appointments_done ?? 0),
      commissionCents,
      totalCents: commissionCents + tipsCents,
      productionCents: servicesCents + productsCents,
    };
  });
  // Quem mais leva no período primeiro; sem movimento vai para o fim, por nome.
  return rows.sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name));
}

export type BarberTicketLine = { name: string; kind: string; quantity: number; totalCents: number };
export type BarberTicket = {
  id: string;
  customerName: string;
  closedAt: string;
  items: BarberTicketLine[];
  servicesCents: number;
  productsCents: number;
  commissionCents: number;
  tipCents: number;
};
export type BarberTopItem = { name: string; kind: string; count: number; totalCents: number };

export type BarberCommissionDetail = {
  barber: { id: string; name: string; fullName: string; jobTitle: string; isActive: boolean; phone: string | null; pctServices: number; pctProducts: number };
  tickets: BarberTicket[];
  topItems: BarberTopItem[];
  servicesCents: number;
  productsCents: number;
  commissionCents: number;
  tipsCents: number;
  appointmentsDone: number;
};

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
  const pctS = Number(barber.commission_services_pct);
  const pctP = Number(barber.commission_products_pct);

  const [ticketsRes, tipsRes, apptRes] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        "id, customer_name, closed_at, ticket_items!inner(name, kind, quantity, unit_price_cents, barber_id)",
      )
      .eq("unit_id", unitId)
      .eq("status", "fechada")
      .eq("ticket_items.barber_id", barberId)
      .gte("closed_at", from)
      .lt("closed_at", to)
      .order("closed_at", { ascending: false })
      .limit(300)
      .returns<
        {
          id: string;
          customer_name: string;
          closed_at: string;
          ticket_items: { name: string; kind: string; quantity: number; unit_price_cents: number }[];
        }[]
      >(),
    supabase
      .from("ticket_tips")
      .select("ticket_id, amount_cents, tickets!inner(id, closed_at, status, unit_id)")
      .eq("unit_id", unitId)
      .eq("barber_id", barberId)
      .returns<{ ticket_id: string; amount_cents: number; tickets: { closed_at: string; status: string } }[]>(),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .eq("barber_id", barberId)
      .eq("status", "concluido")
      .gte("starts_at", from)
      .lt("starts_at", to),
  ]);
  if (ticketsRes.error) console.error("[comissoes] detail tickets:", ticketsRes.error.code);

  // Gorjeta deste barbeiro só entra se a comanda fechou dentro do período.
  const tipByTicket = new Map<string, number>();
  for (const t of tipsRes.data ?? []) {
    const tk = Array.isArray(t.tickets) ? t.tickets[0] : t.tickets;
    if (!tk || tk.status !== "fechada") continue;
    if (tk.closed_at < from || tk.closed_at >= to) continue;
    tipByTicket.set(t.ticket_id, (tipByTicket.get(t.ticket_id) ?? 0) + t.amount_cents);
  }

  let servicesCents = 0;
  let productsCents = 0;
  const top = new Map<string, BarberTopItem>();
  const tickets: BarberTicket[] = (ticketsRes.data ?? []).map((t) => {
    let s = 0;
    let p = 0;
    const items: BarberTicketLine[] = t.ticket_items.map((i) => {
      const total = i.quantity * i.unit_price_cents;
      if (i.kind === "produto") p += total;
      else s += total;
      const key = `${i.kind}:${i.name}`;
      const cur = top.get(key) ?? { name: i.name, kind: i.kind, count: 0, totalCents: 0 };
      cur.count += i.quantity;
      cur.totalCents += total;
      top.set(key, cur);
      return { name: i.name, kind: i.kind, quantity: i.quantity, totalCents: total };
    });
    servicesCents += s;
    productsCents += p;
    return {
      id: t.id,
      customerName: t.customer_name,
      closedAt: t.closed_at,
      items,
      servicesCents: s,
      productsCents: p,
      commissionCents: pctOf(s, pctS) + pctOf(p, pctP),
      tipCents: tipByTicket.get(t.id) ?? 0,
    };
  });

  const commissionCents = pctOf(servicesCents, pctS) + pctOf(productsCents, pctP);
  const tipsCents = tickets.reduce((a, t) => a + t.tipCents, 0);
  return {
    barber: {
      id: barber.id,
      name: barber.display_name,
      fullName: barber.full_name,
      jobTitle: barber.job_title,
      isActive: barber.is_active,
      phone: barber.phone,
      pctServices: pctS,
      pctProducts: pctP,
    },
    tickets,
    topItems: [...top.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, 8),
    servicesCents,
    productsCents,
    commissionCents,
    tipsCents,
    appointmentsDone: apptRes.count ?? 0,
  };
}

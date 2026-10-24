import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ticketTotals, type PayMethod } from "./math";
import type {
  CashMovement,
  CashTicketRow,
  CatalogBarber,
  CatalogProduct,
  CatalogService,
  ClosedRegister,
  MethodTotals,
  OpenRegister,
  RegisterEvent,
  TicketDetail,
} from "./types";

const emptyMethods = (): MethodTotals => ({ dinheiro: 0, pix: 0, debito: 0, credito: 0 });

type ItemRow = {
  name: string;
  quantity: number;
  unit_price_cents: number;
  position: number;
  kind?: string;
  customer_package_id?: string | null;
};

function toTicket(row: {
  id: string;
  customer_name: string;
  barber_name: string | null;
  status: CashTicketRow["status"];
  opened_at: string;
  closed_at: string | null;
  discount_cents: number;
  tip_cents?: number;
  ticket_items: ItemRow[];
  ticket_payments?: { method: PayMethod; amount_cents: number; installments: number | null }[];
}): CashTicketRow {
  const lines = [...(row.ticket_items ?? [])].sort((a, b) => a.position - b.position);
  const total = ticketTotals(
    lines.map((l) => ({
      quantity: l.quantity,
      unitPriceCents: l.unit_price_cents,
      packageCovered: l.kind === "servico" && !!l.customer_package_id,
    })),
    row.discount_cents,
    row.tip_cents ?? 0,
  ).total;
  return {
    id: row.id,
    customerName: row.customer_name,
    barberName: row.barber_name,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    totalCents: total,
    discountCents: row.discount_cents,
    tipCents: row.tip_cents ?? 0,
    items: lines.map((l) => (l.quantity > 1 ? `${l.quantity}× ${l.name}` : l.name)),
    payments: (row.ticket_payments ?? []).map((p) => ({
      method: p.method,
      amountCents: p.amount_cents,
      installments: p.installments ?? 1,
    })),
  };
}

export async function getOpenRegister(unitId: string): Promise<OpenRegister | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_registers")
    .select("id, business_date, opening_cents, opened_at, opened_by_name, notes")
    .eq("unit_id", unitId)
    .eq("status", "aberto")
    .maybeSingle<{
      id: string;
      business_date: string;
      opening_cents: number;
      opened_at: string;
      opened_by_name: string | null;
      notes: string | null;
    }>();
  if (error || !data) {
    if (error) console.error("[caixa] open register:", error.code);
    return null;
  }
  return {
    id: data.id,
    businessDate: data.business_date,
    openingCents: data.opening_cents,
    openedAt: data.opened_at,
    openedByName: data.opened_by_name,
    notes: data.notes,
  };
}

export async function listRegisterPayments(registerId: string): Promise<MethodTotals> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_payments")
    .select("method, amount_cents")
    .eq("register_id", registerId)
    .returns<{ method: PayMethod; amount_cents: number }[]>();
  if (error) {
    console.error("[caixa] payments:", error.code);
    return emptyMethods();
  }
  const totals = emptyMethods();
  for (const p of data ?? []) {
    if (p.method in totals) totals[p.method] += p.amount_cents;
  }
  return totals;
}

export async function listRegisterMovements(registerId: string): Promise<CashMovement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_movements")
    .select("id, kind, amount_cents, note, created_at, created_by_name")
    .eq("register_id", registerId)
    .order("created_at", { ascending: false })
    .limit(80)
    .returns<{ id: string; kind: "sangria" | "suprimento"; amount_cents: number; note: string | null; created_at: string; created_by_name: string | null }[]>();
  if (error) {
    console.error("[caixa] movements:", error.code);
    return [];
  }
  return (data ?? []).map((m) => ({
    id: m.id,
    kind: m.kind,
    amountCents: m.amount_cents,
    note: m.note,
    createdAt: m.created_at,
    authorName: m.created_by_name,
  }));
}

export async function listRegisterEvents(registerId: string): Promise<RegisterEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_register_events")
    .select("id, kind, actor_name, meta, created_at")
    .eq("register_id", registerId)
    .order("created_at", { ascending: false })
    .limit(80)
    .returns<
      {
        id: string;
        kind: RegisterEvent["kind"];
        actor_name: string | null;
        meta: { openingCents?: number; countedCents?: number; expectedCents?: number } | null;
        created_at: string;
      }[]
    >();
  if (error) {
    console.error("[caixa] register events:", error.code);
    return [];
  }
  return (data ?? []).map((e) => ({
    id: e.id,
    kind: e.kind,
    actorName: e.actor_name,
    openingCents: e.meta?.openingCents ?? null,
    countedCents: e.meta?.countedCents ?? null,
    expectedCents: e.meta?.expectedCents ?? null,
    createdAt: e.created_at,
  }));
}

const TICKET_LIST =
  "id, customer_name, barber_name, status, opened_at, closed_at, discount_cents, tip_cents, ticket_items(name, quantity, unit_price_cents, position, kind, customer_package_id), ticket_payments(method, amount_cents, installments)";

export async function listOpenTickets(unitId: string): Promise<CashTicketRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_LIST)
    .eq("unit_id", unitId)
    .eq("status", "aberta")
    .order("opened_at", { ascending: true })
    .limit(80)
    .returns<Parameters<typeof toTicket>[0][]>();
  if (error) {
    console.error("[caixa] open tickets:", error.code);
    return [];
  }
  return (data ?? []).map(toTicket);
}

export async function listRegisterTickets(registerId: string): Promise<CashTicketRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_LIST)
    .eq("register_id", registerId)
    .eq("status", "fechada")
    .order("closed_at", { ascending: false })
    .limit(200)
    .returns<Parameters<typeof toTicket>[0][]>();
  if (error) {
    console.error("[caixa] register tickets:", error.code);
    return [];
  }
  return (data ?? []).map(toTicket);
}

/**
 * Totais por forma das vendas de um DIA de atendimento (attended_on), tenham
 * sido recebidas nele ou depois. É a visão do histórico/faturamento por dia;
 * a gaveta física continua em listRegisterPayments (register_id).
 */
export async function listDayPayments(unitId: string, day: string): Promise<MethodTotals> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_payments")
    .select("method, amount_cents, tickets!inner(id)")
    .eq("unit_id", unitId)
    .eq("tickets.attended_on", day)
    .eq("tickets.status", "fechada")
    .returns<{ method: PayMethod; amount_cents: number }[]>();
  if (error) {
    console.error("[caixa] day payments:", error.code);
    return emptyMethods();
  }
  const totals = emptyMethods();
  for (const p of data ?? []) {
    if (p.method in totals) totals[p.method] += p.amount_cents;
  }
  return totals;
}

/** Comandas cujo atendimento foi neste dia (recebidas nele ou depois). */
export async function listDayTickets(unitId: string, day: string): Promise<CashTicketRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select(TICKET_LIST)
    .eq("unit_id", unitId)
    .eq("attended_on", day)
    .eq("status", "fechada")
    .order("opened_at", { ascending: false })
    .limit(200)
    .returns<Parameters<typeof toTicket>[0][]>();
  if (error) {
    console.error("[caixa] day tickets:", error.code);
    return [];
  }
  return (data ?? []).map(toTicket);
}

export async function getTicket(unitId: string, id: string): Promise<TicketDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, status, customer_id, customer_name, barber_id, barber_name, discount_cents, tip_cents, notes, opened_at, closed_at, appointment_id, ticket_items(kind, service_id, name, quantity, unit_price_cents, barber_id, position, customer_package_id, package_id, customer_packages(package_name)), ticket_tips(barber_id, barber_name, amount_cents, position), ticket_payments(method, amount_cents, installments)",
    )
    .eq("id", id)
    .eq("unit_id", unitId)
    .maybeSingle<{
      id: string;
      status: TicketDetail["status"];
      customer_id: string | null;
      customer_name: string;
      barber_id: string | null;
      barber_name: string | null;
      discount_cents: number;
      tip_cents: number;
      notes: string | null;
      opened_at: string;
      closed_at: string | null;
      appointment_id: string | null;
      ticket_items: {
        kind: "servico" | "produto" | "pacote";
        service_id: string | null;
        name: string;
        quantity: number;
        unit_price_cents: number;
        barber_id: string | null;
        position: number;
        customer_package_id: string | null;
        package_id: string | null;
        customer_packages: { package_name: string } | null;
      }[];
      ticket_tips: { barber_id: string; barber_name: string | null; amount_cents: number; position: number }[] | null;
      ticket_payments: { method: PayMethod; amount_cents: number; installments: number | null }[];
    }>();
  if (error || !data) {
    if (error) console.error("[caixa] ticket:", error.code);
    return null;
  }
  const lines = [...(data.ticket_items ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: data.id,
    status: data.status,
    customerId: data.customer_id,
    customerName: data.customer_name,
    barberId: data.barber_id,
    barberName: data.barber_name,
    discountCents: data.discount_cents,
    tipCents: data.tip_cents,
    notes: data.notes,
    openedAt: data.opened_at,
    closedAt: data.closed_at,
    appointmentId: data.appointment_id,
    lines: lines.map((l) => ({
      kind: l.kind === "produto" ? "produto" : l.kind === "pacote" ? "pacote" : "servico",
      serviceId: l.service_id,
      name: l.name,
      quantity: l.quantity,
      unitPriceCents: l.unit_price_cents,
      barberId: l.barber_id,
      customerPackageId: l.customer_package_id ?? null,
      packageId: l.package_id ?? null,
      packageName: l.customer_packages?.package_name ?? null,
    })),
    tips: [...(data.ticket_tips ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ barberId: t.barber_id, barberName: t.barber_name, amountCents: t.amount_cents })),
    payments: (data.ticket_payments ?? []).map((p) => ({
      method: p.method,
      amountCents: p.amount_cents,
      installments: p.installments ?? 1,
    })),
  };
}

export async function listCatalog(
  unitId: string,
): Promise<{ services: CatalogService[]; products: CatalogProduct[]; barbers: CatalogBarber[] }> {
  const supabase = await createClient();
  const [services, products, barbers] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, price_cents")
      .eq("unit_id", unitId)
      .eq("is_active", true)
      .order("name")
      .limit(200)
      .returns<{ id: string; name: string; price_cents: number }[]>(),
    supabase
      .from("products")
      .select("id, name, price_cents")
      .eq("unit_id", unitId)
      .eq("is_active", true)
      .order("name")
      .limit(200)
      .returns<{ id: string; name: string; price_cents: number }[]>(),
    supabase
      .from("barbers")
      .select("id, display_name")
      .eq("unit_id", unitId)
      .eq("is_active", true)
      .order("display_name")
      .limit(80)
      .returns<{ id: string; display_name: string }[]>(),
  ]);
  return {
    services: (services.data ?? []).map((s) => ({ id: s.id, name: s.name, priceCents: s.price_cents })),
    products: (products.data ?? []).map((p) => ({ id: p.id, name: p.name, priceCents: p.price_cents })),
    barbers: (barbers.data ?? []).map((b) => ({ id: b.id, name: b.display_name })),
  };
}

export async function listClosedRegisters(
  unitId: string,
  range?: { from?: string; to?: string },
): Promise<ClosedRegister[]> {
  const supabase = await createClient();
  let query = supabase
    .from("cash_registers")
    .select(
      "id, business_date, opening_cents, opened_at, opened_by_name, notes, closed_at, closed_by_name, expected_cash_cents, counted_cash_cents",
    )
    .eq("unit_id", unitId)
    .eq("status", "fechado")
    .order("closed_at", { ascending: false })
    .limit(range?.from || range?.to ? 366 : 100);
  if (range?.from) query = query.gte("business_date", range.from);
  if (range?.to) query = query.lte("business_date", range.to);
  const { data, error } = await query
    .returns<
      {
        id: string;
        business_date: string;
        opening_cents: number;
        opened_at: string;
        opened_by_name: string | null;
        notes: string | null;
        closed_at: string;
        closed_by_name: string | null;
        expected_cash_cents: number;
        counted_cash_cents: number;
      }[]
    >();
  if (error || !data?.length) {
    if (error) console.error("[caixa] history:", error.code);
    return [];
  }
  // O faturamento de cada dia é o das comandas ATENDIDAS naquele dia
  // (attended_on), mesmo recebidas depois — não o do caixa que as recebeu.
  const days = data.map((r) => r.business_date);
  const { data: pays } = await supabase
    .from("ticket_payments")
    .select("method, amount_cents, tickets!inner(id, attended_on)")
    .eq("unit_id", unitId)
    .eq("tickets.status", "fechada")
    .in("tickets.attended_on", days)
    .returns<{ method: PayMethod; amount_cents: number; tickets: { attended_on: string } }[]>();
  const byDay = new Map<string, number>();
  for (const p of pays ?? []) {
    const tk = Array.isArray(p.tickets) ? p.tickets[0] : p.tickets;
    if (!tk) continue;
    byDay.set(tk.attended_on, (byDay.get(tk.attended_on) ?? 0) + p.amount_cents);
  }

  const { data: counts } = await supabase
    .from("tickets")
    .select("attended_on, tip_cents")
    .eq("unit_id", unitId)
    .in("attended_on", days)
    .eq("status", "fechada")
    .returns<{ attended_on: string; tip_cents: number | null }[]>();
  const nBy = new Map<string, number>();
  const tipsBy = new Map<string, number>();
  for (const t of counts ?? []) {
    nBy.set(t.attended_on, (nBy.get(t.attended_on) ?? 0) + 1);
    // Gorjeta é do barbeiro, não receita: o "Faturado" do dia é líquido dela.
    tipsBy.set(t.attended_on, (tipsBy.get(t.attended_on) ?? 0) + (t.tip_cents ?? 0));
  }

  return data.map((r) => ({
    id: r.id,
    businessDate: r.business_date,
    openingCents: r.opening_cents,
    openedAt: r.opened_at,
    openedByName: r.opened_by_name,
    notes: r.notes,
    closedAt: r.closed_at,
    closedByName: r.closed_by_name,
    expectedCashCents: r.expected_cash_cents,
    countedCashCents: r.counted_cash_cents,
    ticketCount: nBy.get(r.business_date) ?? 0,
    totalCents: Math.max(0, (byDay.get(r.business_date) ?? 0) - (tipsBy.get(r.business_date) ?? 0)),
  }));
}

export async function getClosedRegister(unitId: string, id: string): Promise<ClosedRegister | null> {
  const list = await listClosedRegisters(unitId);
  return list.find((r) => r.id === id) ?? null;
}

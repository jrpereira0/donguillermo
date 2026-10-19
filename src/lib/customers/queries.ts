import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_COLUMNS, type CustomerHistoryEntry, type CustomerNote, type CustomerRow } from "./types";

export const CUSTOMERS_PAGE_SIZE = 20;

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Filtro de busca (nome sem acento, e-mail, telefone e CPF) no formato do `.or()` do PostgREST.
 * O texto digitado é limpo ANTES de entrar no filtro: vírgula, parênteses e asteriscos
 * mudariam o significado da consulta.
 */
export function searchFilter(raw: string): string | null {
  const t = raw.trim().slice(0, 60);
  if (!t) return null;
  const text = normalize(t)
    .replace(/[^a-z0-9@._\- ]/g, "")
    .trim();
  const digits = t.replace(/\D/g, "");
  const parts: string[] = [];
  if (text) parts.push(`search_name.ilike.*${text}*`, `email.ilike.*${text}*`);
  if (digits.length >= 3) parts.push(`phone.ilike.*${digits}*`, `cpf.ilike.*${digits}*`);
  return parts.length ? parts.join(",") : null;
}

export type CustomerPage = { rows: CustomerRow[]; total: number };

/** Clientes da rede (a RLS só deixa admin e recepção lerem), com busca e paginação no servidor. */
export async function listCustomers(opts: { q?: string; page?: number }): Promise<CustomerPage> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const from = (page - 1) * CUSTOMERS_PAGE_SIZE;
  const supabase = await createClient();

  let query = supabase.from("customers").select(CUSTOMER_COLUMNS, { count: "exact" });
  const filter = searchFilter(opts.q ?? "");
  if (filter) query = query.or(filter);

  const { data, error, count } = await query
    .order("is_active", { ascending: false })
    .order("search_name")
    .range(from, from + CUSTOMERS_PAGE_SIZE - 1)
    .returns<CustomerRow[]>();
  if (error) {
    console.error("[customers] list:", error.code);
    return { rows: [], total: 0 };
  }
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getCustomer(id: string): Promise<CustomerRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS)
    .eq("id", id)
    .maybeSingle<CustomerRow>();
  if (error) console.error("[customers] get:", error.code);
  return data ?? null;
}

/** `{ [unitId]: nome }` de todas as unidades da rede (a recepção não lê `units` de outras unidades). */
export async function listNetworkUnitNames(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("network_units");
  if (error) {
    console.error("[customers] units:", error.code);
    return {};
  }
  return Object.fromEntries(((data ?? []) as { id: string; name: string }[]).map((u) => [u.id, u.name]));
}

/**
 * Comandas do cliente em TODAS as unidades da rede, da mais recente para a mais antiga.
 * A recepção lê comandas da rede (RLS); o nome da unidade vem de `network_units`.
 */
export async function listCustomerHistory(customerId: string): Promise<CustomerHistoryEntry[]> {
  const supabase = await createClient();
  const [tickets, units] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        "id, unit_id, opened_at, status, barber_name, discount_cents, tip_cents, ticket_items(name, quantity, unit_price_cents, position)",
      )
      .eq("customer_id", customerId)
      .order("opened_at", { ascending: false })
      .limit(60)
      .returns<
        {
          id: string;
          unit_id: string;
          opened_at: string;
          status: CustomerHistoryEntry["status"];
          barber_name: string | null;
          discount_cents: number;
          tip_cents: number;
          ticket_items: { name: string; quantity: number; unit_price_cents: number; position: number }[];
        }[]
      >(),
    supabase.rpc("network_units"),
  ]);
  if (tickets.error) {
    console.error("[customers] history:", tickets.error.code);
    return [];
  }
  const byId = new Map(
    ((units.data ?? []) as { id: string; name: string; slug: string }[]).map((u) => [u.id, u]),
  );
  return (tickets.data ?? []).map((t) => {
    const lines = [...(t.ticket_items ?? [])].sort((a, b) => a.position - b.position);
    const subtotal = lines.reduce((n, l) => n + l.quantity * l.unit_price_cents, 0);
    const unit = byId.get(t.unit_id);
    return {
      id: t.id,
      openedAt: t.opened_at,
      unitName: unit?.name ?? "Unidade",
      unitSlug: unit?.slug ?? null,
      barberName: t.barber_name,
      status: t.status,
      totalCents: Math.max(0, subtotal - t.discount_cents) + (t.tip_cents ?? 0),
      items: lines.map((l) => (l.quantity > 1 ? `${l.quantity}× ${l.name}` : l.name)),
    };
  });
}

/** Observações do cliente, da mais recente para a mais antiga (`unitNames`: id -> nome, de listNetworkUnitNames). */
export async function listCustomerNotes(customerId: string, unitNames: Record<string, string>): Promise<CustomerNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_notes")
    .select("id, body, author_name, unit_id, created_at, updated_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .returns<
      { id: string; body: string; author_name: string | null; unit_id: string | null; created_at: string; updated_at: string }[]
    >();
  if (error) {
    console.error("[customers] notes:", error.code);
    return [];
  }
  return (data ?? []).map((n) => ({
    id: n.id,
    body: n.body,
    authorName: n.author_name,
    unitName: n.unit_id ? (unitNames[n.unit_id] ?? null) : null,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }));
}

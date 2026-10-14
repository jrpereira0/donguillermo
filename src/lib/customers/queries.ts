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
 * O módulo de comandas ainda não existe, então por enquanto devolve lista vazia; quando
 * existir, é aqui que a consulta entra (sempre trazendo o nome da unidade de cada comanda).
 */
export async function listCustomerHistory(customerId: string): Promise<CustomerHistoryEntry[]> {
  void customerId;
  return [];
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

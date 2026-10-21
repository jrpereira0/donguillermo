import "server-only";
import { createClient } from "@/lib/supabase/server";
import { packagePriceCents } from "./math";
import type {
  CustomerPackage,
  CustomerPackageStatus,
  PackageTemplate,
  PackageUseEntry,
  UsableCustomerPackage,
} from "./types";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  discount_pct: number;
  validity_days: number | null;
  is_active: boolean;
  package_items: { service_id: string; quantity: number; position: number; services: { name: string; price_cents: number } | null }[];
};

function toTemplate(r: TemplateRow, buyersCount: number): PackageTemplate {
  const items = [...(r.package_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      serviceId: i.service_id,
      serviceName: i.services?.name ?? "Serviço",
      quantity: i.quantity,
      unitPriceCents: i.services?.price_cents ?? 0,
    }));
  const listCents = items.reduce((n, i) => n + i.quantity * i.unitPriceCents, 0);
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    discountPct: Number(r.discount_pct),
    validityDays: r.validity_days,
    isActive: r.is_active,
    items,
    listCents,
    priceCents: packagePriceCents(listCents, Number(r.discount_pct)),
    buyersCount,
  };
}

const TEMPLATE_SELECT =
  "id, name, description, discount_pct, validity_days, is_active, package_items(service_id, quantity, position, services(name, price_cents))";

export async function listPackages(unitId: string): Promise<PackageTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .select(TEMPLATE_SELECT)
    .eq("unit_id", unitId)
    .order("is_active", { ascending: false })
    .order("name")
    .limit(100)
    .returns<TemplateRow[]>();
  if (error) {
    console.error("[packages] list:", error.code);
    return [];
  }
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: buyers } = await supabase
    .from("customer_packages")
    .select("package_id")
    .eq("unit_id", unitId)
    .neq("status", "cancelada")
    .in("package_id", rows.map((r) => r.id))
    .returns<{ package_id: string }[]>();
  const counts = new Map<string, number>();
  for (const b of buyers ?? []) counts.set(b.package_id, (counts.get(b.package_id) ?? 0) + 1);
  return rows.map((r) => toTemplate(r, counts.get(r.id) ?? 0));
}

export async function getPackage(unitId: string, id: string): Promise<PackageTemplate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("packages")
    .select(TEMPLATE_SELECT)
    .eq("unit_id", unitId)
    .eq("id", id)
    .maybeSingle<TemplateRow>();
  if (error) console.error("[packages] get:", error.code);
  return data ? toTemplate(data, 0) : null;
}

type CpRow = {
  id: string;
  package_id: string | null;
  package_name: string;
  discount_pct: number;
  list_cents: number;
  price_cents: number;
  status: "pendente" | "ativa" | "cancelada";
  sold_at: string;
  activated_at: string | null;
  expires_at: string | null;
  sold_ticket_id: string | null;
  validity_days: number | null;
  customer_package_items: {
    service_id: string | null;
    service_name: string;
    quantity_total: number;
    unit_price_cents: number;
  }[];
};

function deriveStatus(r: CpRow, remaining: number, total: number): CustomerPackageStatus {
  if (r.status === "cancelada") return "cancelada";
  if (r.status === "pendente") return "pendente";
  if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) return "expirada";
  if (total > 0 && remaining <= 0) return "esgotada";
  return "ativa";
}

/**
 * Pacotes de um cliente nesta unidade, com saldo por serviço.
 * Uso = itens "pelo pacote" em comandas não canceladas. `excludeTicketId`
 * ignora os itens daquela comanda (o editor da comanda desconta o rascunho dele).
 */
export async function listCustomerPackages(
  unitId: string,
  customerId: string,
  opts?: { excludeTicketId?: string; onlyUsable?: boolean },
): Promise<CustomerPackage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_packages")
    .select(
      "id, package_id, package_name, discount_pct, list_cents, price_cents, status, sold_at, activated_at, expires_at, sold_ticket_id, validity_days, customer_package_items(service_id, service_name, quantity_total, unit_price_cents)",
    )
    .eq("unit_id", unitId)
    .eq("customer_id", customerId)
    .order("sold_at", { ascending: false })
    .limit(50)
    .returns<CpRow[]>();
  if (error) {
    console.error("[packages] customer packages:", error.code);
    return [];
  }
  const rows = data ?? [];
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const { data: uses } = await supabase
    .from("ticket_items")
    .select("customer_package_id, service_id, quantity, ticket_id, tickets!inner(status)")
    .in("customer_package_id", ids)
    .eq("kind", "servico")
    .returns<
      {
        customer_package_id: string;
        service_id: string | null;
        quantity: number;
        ticket_id: string;
        tickets: { status: string };
      }[]
    >();
  const usedBy = new Map<string, number>(); // `${cpId}:${serviceId}` -> qty
  for (const u of uses ?? []) {
    if (!u.customer_package_id || !u.service_id) continue;
    if (u.tickets?.status === "cancelada") continue;
    if (opts?.excludeTicketId && u.ticket_id === opts.excludeTicketId) continue;
    const k = `${u.customer_package_id}:${u.service_id}`;
    usedBy.set(k, (usedBy.get(k) ?? 0) + u.quantity);
  }

  const out: CustomerPackage[] = rows.map((r) => {
    const items = (r.customer_package_items ?? []).map((i) => ({
      serviceId: i.service_id,
      serviceName: i.service_name,
      quantityTotal: i.quantity_total,
      used: i.service_id ? (usedBy.get(`${r.id}:${i.service_id}`) ?? 0) : 0,
      unitPriceCents: i.unit_price_cents,
    }));
    const total = items.reduce((n, i) => n + i.quantityTotal, 0);
    const used = items.reduce((n, i) => n + Math.min(i.used, i.quantityTotal), 0);
    const remaining = total - used;
    return {
      id: r.id,
      packageId: r.package_id,
      packageName: r.package_name,
      discountPct: Number(r.discount_pct),
      listCents: r.list_cents,
      priceCents: r.price_cents,
      status: deriveStatus(r, remaining, total),
      soldAt: r.sold_at,
      activatedAt: r.activated_at,
      expiresAt: r.expires_at,
      soldTicketId: r.sold_ticket_id,
      items,
      totalServices: total,
      usedServices: used,
      remainingServices: remaining,
    };
  });
  return opts?.onlyUsable ? out.filter((p) => p.status === "ativa" && p.remainingServices > 0) : out;
}

type UsableCpRow = {
  id: string;
  customer_id: string;
  package_name: string;
  expires_at: string | null;
  customer_package_items: {
    service_id: string | null;
    service_name: string;
    quantity_total: number;
  }[];
};

/**
 * Saldos utilizáveis de vários clientes de uma vez (busca da agenda): pacotes
 * ativos e não vencidos, só com serviços que ainda têm saldo. Três consultas
 * no total, independente do número de clientes.
 */
export async function listUsablePackagesForCustomers(
  unitId: string,
  customerIds: string[],
): Promise<Record<string, UsableCustomerPackage[]>> {
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (!ids.length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_packages")
    .select("id, customer_id, package_name, expires_at, customer_package_items(service_id, service_name, quantity_total)")
    .eq("unit_id", unitId)
    .in("customer_id", ids)
    .eq("status", "ativa")
    .order("sold_at", { ascending: false })
    .limit(100)
    .returns<UsableCpRow[]>();
  if (error) {
    console.error("[packages] usable by customers:", error.code);
    return {};
  }
  const now = Date.now();
  const rows = (data ?? []).filter((r) => !r.expires_at || new Date(r.expires_at).getTime() >= now);
  if (!rows.length) return {};

  const { data: uses } = await supabase
    .from("ticket_items")
    .select("customer_package_id, service_id, quantity, tickets!inner(status)")
    .in("customer_package_id", rows.map((r) => r.id))
    .eq("kind", "servico")
    .limit(5000)
    .returns<{ customer_package_id: string; service_id: string | null; quantity: number; tickets: { status: string } }[]>();
  const usedBy = new Map<string, number>();
  for (const u of uses ?? []) {
    if (!u.service_id || u.tickets?.status === "cancelada") continue;
    const k = `${u.customer_package_id}:${u.service_id}`;
    usedBy.set(k, (usedBy.get(k) ?? 0) + u.quantity);
  }

  const out: Record<string, UsableCustomerPackage[]> = {};
  for (const r of rows) {
    const items = (r.customer_package_items ?? [])
      .filter((i) => i.service_id)
      .map((i) => ({
        serviceId: i.service_id!,
        serviceName: i.service_name,
        quantityTotal: i.quantity_total,
        remaining: i.quantity_total - (usedBy.get(`${r.id}:${i.service_id}`) ?? 0),
      }))
      .filter((i) => i.remaining > 0);
    if (!items.length) continue;
    (out[r.customer_id] ??= []).push({ id: r.id, name: r.package_name, items });
  }
  return out;
}

/** Histórico de uso: cada serviço baixado do pacote, com a comanda de origem. */
export async function listPackageUses(unitId: string, customerId: string): Promise<PackageUseEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ticket_items")
    .select(
      "name, quantity, barber_name, ticket_id, customer_packages!inner(package_name), tickets!inner(customer_id, status, opened_at, closed_at)",
    )
    .eq("unit_id", unitId)
    .eq("kind", "servico")
    .not("customer_package_id", "is", null)
    .eq("tickets.customer_id", customerId)
    .order("id", { ascending: false })
    .limit(80)
    .returns<
      {
        name: string;
        quantity: number;
        barber_name: string | null;
        ticket_id: string;
        customer_packages: { package_name: string } | null;
        tickets: { status: PackageUseEntry["ticketStatus"]; opened_at: string; closed_at: string | null };
      }[]
    >();
  if (error) {
    console.error("[packages] uses:", error.code);
    return [];
  }
  return (data ?? [])
    .filter((u) => u.tickets && u.tickets.status !== "cancelada")
    .map((u) => ({
      ticketId: u.ticket_id,
      ticketStatus: u.tickets.status,
      serviceName: u.name,
      quantity: u.quantity,
      barberName: u.barber_name,
      packageName: u.customer_packages?.package_name ?? "Pacote",
      whenAt: u.tickets.closed_at ?? u.tickets.opened_at,
    }));
}

/** Clientes que compraram um pacote do catálogo (para a tela do pacote). */
export async function listPackageBuyers(
  unitId: string,
  packageId: string,
): Promise<
  { customerId: string; customerName: string; status: CustomerPackageStatus; soldAt: string; remaining: number; total: number; cpId: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_packages")
    .select(
      "id, package_id, package_name, discount_pct, list_cents, price_cents, status, sold_at, activated_at, expires_at, sold_ticket_id, validity_days, customer_id, customers(full_name), customer_package_items(service_id, service_name, quantity_total, unit_price_cents)",
    )
    .eq("unit_id", unitId)
    .eq("package_id", packageId)
    .order("sold_at", { ascending: false })
    .limit(100)
    .returns<(CpRow & { customer_id: string; customers: { full_name: string } | null })[]>();
  if (error) {
    console.error("[packages] buyers:", error.code);
    return [];
  }
  const rows = data ?? [];
  if (!rows.length) return [];

  const { data: uses } = await supabase
    .from("ticket_items")
    .select("customer_package_id, service_id, quantity, tickets!inner(status)")
    .in("customer_package_id", rows.map((r) => r.id))
    .eq("kind", "servico")
    .returns<{ customer_package_id: string; service_id: string | null; quantity: number; tickets: { status: string } }[]>();
  const usedBy = new Map<string, number>();
  for (const u of uses ?? []) {
    if (!u.service_id || u.tickets?.status === "cancelada") continue;
    const k = `${u.customer_package_id}:${u.service_id}`;
    usedBy.set(k, (usedBy.get(k) ?? 0) + u.quantity);
  }

  return rows.map((r) => {
    const total = (r.customer_package_items ?? []).reduce((n, i) => n + i.quantity_total, 0);
    const used = (r.customer_package_items ?? []).reduce(
      (n, i) => n + Math.min(i.service_id ? (usedBy.get(`${r.id}:${i.service_id}`) ?? 0) : 0, i.quantity_total),
      0,
    );
    return {
      cpId: r.id,
      customerId: r.customer_id,
      customerName: r.customers?.full_name ?? "Cliente",
      status: deriveStatus(r, total - used, total),
      soldAt: r.sold_at,
      remaining: total - used,
      total,
    };
  }).filter((b) => b.status !== "cancelada");
}

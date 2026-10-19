import "server-only";
import { barberPhotoUrl } from "@/lib/barbers/photo";
import { createClient } from "@/lib/supabase/server";
import { jobTitleLabel } from "@/lib/validation/barber";
import { categoryLabel } from "@/lib/validation/service";
import { dayBoundsUtc, utcToZoned } from "./time";
import type { AgendaBarber, AgendaEntry, AgendaOffers, AgendaService } from "./types";

type BarberRow = {
  id: string;
  display_name: string;
  job_title: string;
  photo_path: string | null;
  updated_at: string;
  work_hours: unknown;
  is_active: boolean;
};

type EntryRow = {
  id: string;
  barber_id: string;
  kind: "appointment" | "block";
  status: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  created_by_name: string | null;
  has_barber_preference: boolean | null;
  appointment_services: { position: number; service_id: string; name: string; duration_minutes: number; price_cents: number }[];
};

const ENTRY_COLUMNS =
  "id, barber_id, kind, status, customer_id, customer_name, customer_phone, notes, starts_at, ends_at, created_by_name, has_barber_preference, appointment_services(position, service_id, name, duration_minutes, price_cents)";

/** Agendamentos e bloqueios que tocam o dia (data local da unidade), já em horário local. */
export async function listAgendaEntries(unitId: string, date: string): Promise<AgendaEntry[]> {
  const { start, end } = dayBoundsUtc(date);
  const supabase = await createClient();
  // Cancelado não aparece na grade: horário liberado, como se tivesse sido excluído.
  // Falta (no-show) continua visível para a recepção acompanhar.
  const { data, error } = await supabase
    .from("appointments")
    .select(ENTRY_COLUMNS)
    .eq("unit_id", unitId)
    .neq("status", "cancelado")
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString())
    .order("starts_at")
    .returns<EntryRow[]>();
  if (error) {
    console.error("[agenda] entries:", error.code);
    return [];
  }

  return (data ?? []).map((r) => {
    const s = utcToZoned(r.starts_at);
    const e = utcToZoned(r.ends_at);
    // Limita ao dia exibido (um atendimento que atravessa a meia-noite aparece cortado).
    const startMin = s.date === date ? s.minutes : 0;
    const endMin = e.date === date ? e.minutes : 1440;
    return {
      id: r.id,
      barberId: r.barber_id,
      kind: r.kind,
      status: r.status,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      notes: r.notes,
      date: s.date,
      time: s.time,
      endTime: e.time,
      startMin,
      endMin: Math.max(endMin, startMin + 1),
      services: [...(r.appointment_services ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((x) => ({ serviceId: x.service_id, name: x.name, minutes: x.duration_minutes, priceCents: x.price_cents })),
      authorName: r.created_by_name,
      hasBarberPreference: r.kind === "appointment" ? r.has_barber_preference !== false : true,
    };
  });
}

/**
 * Profissionais da grade: os ativos da unidade, mais os desativados que ainda têm horário
 * no dia (para o horário não "sumir" da agenda).
 */
export async function listAgendaBarbers(unitId: string, withEntriesIds: Set<string>): Promise<AgendaBarber[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barbers")
    .select("id, display_name, job_title, photo_path, updated_at, work_hours, is_active")
    .eq("unit_id", unitId)
    .order("display_name")
    .returns<BarberRow[]>();
  if (error) {
    console.error("[agenda] barbers:", error.code);
    return [];
  }
  return (data ?? [])
    .filter((b) => b.is_active || withEntriesIds.has(b.id))
    .map((b) => ({
      id: b.id,
      name: b.display_name,
      role: jobTitleLabel(b.job_title),
      photoUrl: barberPhotoUrl(b.photo_path, b.updated_at),
      workHours: b.work_hours,
      inactive: !b.is_active,
    }));
}

/** Catálogo ativo da unidade e quem faz cada serviço (com a duração própria do profissional). */
export async function getAgendaCatalog(
  unitId: string,
): Promise<{ services: AgendaService[]; offers: AgendaOffers; popularIds: string[] }> {
  const supabase = await createClient();
  const [svc, links, usage] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, category, duration_minutes, price_cents")
      .eq("unit_id", unitId)
      .eq("is_active", true)
      .order("name")
      .returns<{ id: string; name: string; category: string; duration_minutes: number; price_cents: number }[]>(),
    supabase
      .from("barber_services")
      .select("barber_id, service_id, duration_minutes")
      .eq("unit_id", unitId)
      .returns<{ barber_id: string; service_id: string; duration_minutes: number | null }[]>(),
    // Frequência recente na unidade (para “Mais acessados” no modal).
    supabase
      .from("appointment_services")
      .select("service_id, appointments!inner(unit_id, kind)")
      .eq("appointments.unit_id", unitId)
      .eq("appointments.kind", "appointment")
      .limit(4000)
      .returns<{ service_id: string }[]>(),
  ]);
  if (svc.error) console.error("[agenda] services:", svc.error.code);
  if (links.error) console.error("[agenda] offers:", links.error.code);
  if (usage.error) console.error("[agenda] popular services:", usage.error.code);

  const services: AgendaService[] = (svc.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    categoryLabel: categoryLabel(s.category),
    minutes: s.duration_minutes,
    priceCents: s.price_cents,
  }));
  const active = new Set(services.map((s) => s.id));
  const offers: AgendaOffers = {};
  for (const l of links.data ?? []) {
    if (!active.has(l.service_id)) continue;
    (offers[l.barber_id] ??= {})[l.service_id] = l.duration_minutes;
  }

  const counts = new Map<string, number>();
  for (const row of usage.data ?? []) {
    if (!active.has(row.service_id)) continue;
    counts.set(row.service_id, (counts.get(row.service_id) ?? 0) + 1);
  }
  const popularIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)
    .slice(0, 8);

  return { services, offers, popularIds };
}

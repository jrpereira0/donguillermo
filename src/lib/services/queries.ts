import "server-only";
import { barberPhotoUrl } from "@/lib/barbers/photo";
import { createClient } from "@/lib/supabase/server";
import { jobTitleLabel } from "@/lib/validation/barber";
import { categoryLabel } from "@/lib/validation/service";
import { serviceImageUrl } from "./image";
import { SERVICE_COLUMNS, type AssignableBarber, type AssignableService, type ServiceBarberLink, type ServiceRow } from "./types";

/** Serviços da unidade (a RLS garante que só admin/recepção/barbeiros da unidade leem). */
export async function listServices(unitId: string): Promise<ServiceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .eq("unit_id", unitId)
    .order("is_active", { ascending: false })
    .order("name")
    .returns<ServiceRow[]>();
  if (error) {
    console.error("[services] list:", error.code);
    return [];
  }
  return data ?? [];
}

export async function getService(unitId: string, id: string): Promise<ServiceRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_COLUMNS)
    .eq("unit_id", unitId)
    .eq("id", id)
    .maybeSingle<ServiceRow>();
  if (error) console.error("[services] get:", error.code);
  return data ?? null;
}

/** Profissionais ativos da unidade, em ordem alfabética. */
export async function listAssignableBarbers(unitId: string): Promise<AssignableBarber[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barbers")
    .select("id, display_name, job_title, photo_path, updated_at")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .order("display_name")
    .returns<{ id: string; display_name: string; job_title: string; photo_path: string | null; updated_at: string }[]>();
  if (error) {
    console.error("[services] barbers:", error.code);
    return [];
  }
  return (data ?? []).map((b) => ({
    id: b.id,
    name: b.display_name,
    role: jobTitleLabel(b.job_title),
    photoUrl: barberPhotoUrl(b.photo_path, b.updated_at),
  }));
}

/** Ligações serviço -> profissionais da unidade: `{ [serviceId]: [{ barberId, minutes }] }` (minutes null = duração padrão). */
export async function listServiceBarberLinks(unitId: string): Promise<Record<string, ServiceBarberLink[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barber_services")
    .select("service_id, barber_id, duration_minutes")
    .eq("unit_id", unitId)
    .returns<{ service_id: string; barber_id: string; duration_minutes: number | null }[]>();
  if (error) {
    console.error("[services] links:", error.code);
    return {};
  }
  const out: Record<string, ServiceBarberLink[]> = {};
  for (const l of data ?? []) (out[l.service_id] ??= []).push({ barberId: l.barber_id, minutes: l.duration_minutes });
  return out;
}

/** Serviços ativos da unidade, em ordem alfabética (para escolher o que o profissional faz). */
export async function listAssignableServices(unitId: string): Promise<AssignableService[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("id, name, category, duration_minutes, image_path, updated_at")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .order("name")
    .returns<{ id: string; name: string; category: string; duration_minutes: number; image_path: string | null; updated_at: string }[]>();
  if (error) {
    console.error("[services] assignable:", error.code);
    return [];
  }
  return (data ?? []).map((x) => ({
    id: x.id,
    name: x.name,
    category: x.category,
    categoryLabel: categoryLabel(x.category),
    minutes: x.duration_minutes,
    imageUrl: serviceImageUrl(x.image_path, x.updated_at),
  }));
}

/** Serviços que o profissional faz: `{ [serviceId]: "45" | "" }` ("" = duração padrão). */
export async function getBarberServiceMinutes(unitId: string, barberId: string): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barber_services")
    .select("service_id, duration_minutes")
    .eq("unit_id", unitId)
    .eq("barber_id", barberId)
    .returns<{ service_id: string; duration_minutes: number | null }[]>();
  if (error) {
    console.error("[services] barber links:", error.code);
    return {};
  }
  return Object.fromEntries((data ?? []).map((l) => [l.service_id, l.duration_minutes ? String(l.duration_minutes) : ""]));
}

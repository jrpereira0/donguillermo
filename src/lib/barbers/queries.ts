import "server-only";
import { createClient } from "@/lib/supabase/server";
import { BARBER_COLUMNS, type BarberRow } from "./types";

/** Barbeiros da unidade (a RLS garante que só recepção/admin da unidade leem). */
export async function listBarbers(unitId: string): Promise<BarberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barbers")
    .select(BARBER_COLUMNS)
    .eq("unit_id", unitId)
    .order("is_active", { ascending: false })
    .order("display_name")
    .returns<BarberRow[]>();
  if (error) {
    console.error("[barbers] list:", error.code);
    return [];
  }
  return data ?? [];
}

export async function getBarber(unitId: string, id: string): Promise<BarberRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barbers")
    .select(BARBER_COLUMNS)
    .eq("unit_id", unitId)
    .eq("id", id)
    .maybeSingle<BarberRow>();
  if (error) console.error("[barbers] get:", error.code);
  return data ?? null;
}

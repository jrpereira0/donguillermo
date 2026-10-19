import "server-only";
import { createClient } from "@/lib/supabase/server";
import { UNIT_SETTINGS_COLUMNS, type UnitSettingsRow } from "./types";

/** Configurações da unidade (a RLS libera admin e quem é da unidade). */
export async function getUnitSettings(unitId: string): Promise<UnitSettingsRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select(UNIT_SETTINGS_COLUMNS)
    .eq("id", unitId)
    .is("deleted_at", null)
    .maybeSingle<UnitSettingsRow>();
  if (error) console.error("[units] settings:", error.code);
  return data ?? null;
}

/** Durações (min) dos serviços ativos: a tela avisa quando não fecham com a linha da agenda. */
export async function listActiveServiceDurations(unitId: string): Promise<number[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .select("duration_minutes")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .returns<{ duration_minutes: number }[]>();
  if (error) {
    console.error("[units] service durations:", error.code);
    return [];
  }
  return (data ?? []).map((s) => s.duration_minutes);
}

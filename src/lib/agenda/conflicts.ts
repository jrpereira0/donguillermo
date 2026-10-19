import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Horário já tem agendamento ativo neste profissional?
 *
 * Usar só no booking do **cliente** (navegador). A recepção pode encaixar
 * e não deve chamar isto para barrar a gravação.
 */
export async function appointmentSlotTaken(
  supabase: SupabaseClient,
  opts: { barberId: string; startsAt: Date; endsAt: Date; excludeId?: string | null },
): Promise<boolean> {
  let q = supabase
    .from("appointments")
    .select("id")
    .eq("barber_id", opts.barberId)
    .eq("kind", "appointment")
    .in("status", ["agendado", "confirmado", "em_atendimento", "concluido"])
    .lt("starts_at", opts.endsAt.toISOString())
    .gt("ends_at", opts.startsAt.toISOString())
    .limit(1);
  if (opts.excludeId) q = q.neq("id", opts.excludeId);
  const { data, error } = await q.returns<{ id: string }[]>();
  if (error) {
    console.error("[agenda] slot check:", error.code);
    return true;
  }
  return (data?.length ?? 0) > 0;
}

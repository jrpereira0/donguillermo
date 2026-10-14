import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { DURATIONS } from "@/lib/validation/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Item marcado -> duração própria em minutos (`null` = usa a padrão do serviço). */
export type LinkSelection = Map<string, number | null>;

/**
 * Lê do formulário os itens marcados (campo repetido `idsField`) e a duração própria de cada
 * um (`<minutesPrefix><id>`, vazio = padrão). Devolve `null` se algum id ou duração for inválido.
 */
export function selectionFrom(form: FormData, idsField: string, minutesPrefix: string): LinkSelection | null {
  const ids = [...new Set(form.getAll(idsField).filter((v): v is string => typeof v === "string"))];
  const out: LinkSelection = new Map();
  for (const raw of ids) {
    if (!UUID.test(raw)) return null;
    const field = form.get(`${minutesPrefix}${raw}`);
    const m = (typeof field === "string" ? field : "").trim();
    if (!m) {
      out.set(raw.toLowerCase(), null);
      continue;
    }
    const n = Number(m);
    if (!Number.isInteger(n) || !(DURATIONS as readonly number[]).includes(n)) return null;
    out.set(raw.toLowerCase(), n);
  }
  return out;
}

/**
 * Deixa as ligações profissional x serviço (e a duração de cada uma) iguais ao marcado no
 * formulário. `by` diz de que lado se está editando:
 *  - "service": `owner` é o serviço e `selected` são profissionais;
 *  - "barber": `owner` é o profissional e `selected` são serviços.
 * Só considera itens ATIVOS da unidade: ids de fora são ignorados e as ligações de itens
 * inativos (que a tela não mostra) ficam como estão. O banco ainda garante a mesma unidade.
 */
export async function syncLinks(
  supabase: Supabase,
  unitId: string,
  by: "service" | "barber",
  ownerId: string,
  selected: LinkSelection,
): Promise<boolean> {
  const ownerCol = by === "service" ? "service_id" : "barber_id";
  const otherCol = by === "service" ? "barber_id" : "service_id";
  const otherTable = by === "service" ? "barbers" : "services";

  const { data: active, error: e1 } = await supabase
    .from(otherTable)
    .select("id")
    .eq("unit_id", unitId)
    .eq("is_active", true)
    .returns<{ id: string }[]>();
  const { data: links, error: e2 } = await supabase
    .from("barber_services")
    .select("barber_id, service_id, duration_minutes")
    .eq("unit_id", unitId)
    .eq(ownerCol, ownerId)
    .returns<{ barber_id: string; service_id: string; duration_minutes: number | null }[]>();
  if (e1 || e2) {
    console.error("[links] read:", e1?.code ?? e2?.code);
    return false;
  }

  const activeSet = new Set((active ?? []).map((x) => x.id.toLowerCase()));
  const wanted = new Map([...selected].filter(([id]) => activeSet.has(id)));
  const current = new Map((links ?? []).map((l) => [l[otherCol].toLowerCase(), l.duration_minutes] as const));

  const toAdd = [...wanted].filter(([id]) => !current.has(id));
  const toUpdate = [...wanted].filter(([id, min]) => current.has(id) && current.get(id) !== min);
  const toRemove = [...current.keys()].filter((id) => activeSet.has(id) && !wanted.has(id));

  if (toAdd.length) {
    const { error } = await supabase.from("barber_services").insert(
      toAdd.map(([other, duration_minutes]) => ({
        [ownerCol]: ownerId,
        [otherCol]: other,
        unit_id: unitId,
        duration_minutes,
      })),
    );
    if (error) {
      console.error("[links] insert:", error.code);
      return false;
    }
  }
  for (const [other, minutes] of toUpdate) {
    const { error } = await supabase
      .from("barber_services")
      .update({ duration_minutes: minutes })
      .eq("unit_id", unitId)
      .eq(ownerCol, ownerId)
      .eq(otherCol, other);
    if (error) {
      console.error("[links] update:", error.code);
      return false;
    }
  }
  if (toRemove.length) {
    const { error } = await supabase
      .from("barber_services")
      .delete()
      .eq("unit_id", unitId)
      .eq(ownerCol, ownerId)
      .in(otherCol, toRemove);
    if (error) {
      console.error("[links] delete:", error.code);
      return false;
    }
  }
  return true;
}

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type UnitMember = {
  id: string;
  user_id: string;
  role: "admin_rede" | "recepcao" | "barbeiro";
  is_active: boolean;
  profiles: { email: string; full_name: string | null; is_active: boolean } | null;
};

export type UnitRow = {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  opening_hours: unknown;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  unit_members: UnitMember[];
};

const SELECT =
  "id, slug, name, address, phone, opening_hours, is_active, deleted_at, created_at, " +
  "unit_members(id, user_id, role, is_active, profiles(email, full_name, is_active))";

/**
 * Todas as unidades (não excluídas) com seus vínculos. Usa a sessão do admin:
 * a RLS é que libera a rede inteira — quem não é admin recebe lista vazia.
 */
export async function listUnits(): Promise<UnitRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select(SELECT)
    .is("deleted_at", null)
    .order("name")
    .returns<UnitRow[]>();
  if (error) throw new Error(`Falha ao listar unidades: ${error.message}`);
  return data ?? [];
}

export async function getUnitBySlug(slug: string): Promise<UnitRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select(SELECT)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle<UnitRow>();
  if (error) throw new Error(`Falha ao buscar unidade: ${error.message}`);
  return data;
}

export function receptionOf(unit: Pick<UnitRow, "unit_members">): UnitMember[] {
  return unit.unit_members.filter((m) => m.role === "recepcao");
}

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Membership } from "./roles";

export type AuthContext = {
  userId: string;
  email: string;
  fullName: string | null;
  /** Perfil ativo? Se não, `memberships` vem vazio. */
  active: boolean;
  memberships: Membership[];
};

type MemberRow = {
  role: AppRole;
  units: { id: string; slug: string; name: string } | null;
};

/**
 * Lê usuário + vínculos do banco, SEMPRE sob a RLS do próprio usuário.
 * - `getUser()` valida o token no servidor do Supabase (não confia só no cookie).
 * - Unidade inativa/excluída some do resultado (a RLS de `units` a esconde),
 *   e o vínculo sem unidade é descartado: o acesso cai junto com a unidade.
 * `cache()` evita repetir as consultas dentro da mesma requisição.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, is_active")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("unit_members")
      .select("role, units(id, slug, name)")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .returns<MemberRow[]>(),
  ]);

  const active = profile?.is_active === true;
  const memberships: Membership[] = active
    ? (rows ?? [])
        .filter((r) => r.role === "admin_rede" || r.units !== null)
        .map((r) => ({ role: r.role, unit: r.units }))
    : [];

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    active,
    memberships,
  };
});

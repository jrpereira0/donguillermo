import "server-only";
import { redirect } from "next/navigation";
import {
  canAccessUnitArea,
  canSeeUnit,
  isNetworkAdmin,
  type UnitArea,
  type UnitRef,
} from "./roles";
import { getAuthContext, type AuthContext } from "./session";
import { createClient } from "@/lib/supabase/server";

/** Destino único para qualquer acesso indevido (não revela se a unidade existe). */
export const FORBIDDEN_URL = "/sem-acesso?motivo=area";

/** Exige sessão válida; senão volta ao login. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Só o administrador da rede. */
export async function requireNetworkAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!isNetworkAdmin(ctx.memberships)) redirect(FORBIDDEN_URL);
  return ctx;
}

/** Resolve a unidade `slug` para quem pode vê-la; redireciona se não puder. */
export async function requireUnit(
  slug: string,
): Promise<{ ctx: AuthContext; unit: UnitRef }> {
  const ctx = await requireAuth();
  if (!canSeeUnit(ctx.memberships, slug)) redirect(FORBIDDEN_URL);

  const fromMembership = ctx.memberships.find((m) => m.unit?.slug === slug)?.unit;
  if (fromMembership) return { ctx, unit: fromMembership };

  // Admin da rede: busca a unidade (a RLS libera todas para ele).
  const supabase = await createClient();
  const { data } = await supabase
    .from("units")
    .select("id, slug, name")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) redirect(FORBIDDEN_URL);
  return { ctx, unit: data };
}

/** Exige o papel da `area` na unidade `slug` (ou admin da rede). */
export async function requireUnitArea(slug: string, area: UnitArea) {
  const result = await requireUnit(slug);
  if (!canAccessUnitArea(result.ctx.memberships, slug, area)) {
    redirect(FORBIDDEN_URL);
  }
  return result;
}

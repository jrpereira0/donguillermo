"use server";

import { revalidatePath } from "next/cache";
import { requireNetworkAdmin } from "@/lib/auth/guards";
import { validateBrackets, type CommissionBracket } from "@/lib/commissions/brackets";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type BracketsSaveResult = { ok: true } | { ok: false; message: string };
export type CommissionSaveResult = { ok: true } | { ok: false; message: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** % válido (0 a 100, até 2 casas) ou erro. */
function pctOrError(v: unknown): number | null {
  const n = num(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

/** Salva o % de produtos da rede (linha única de commission_settings). */
export async function saveNetworkProductsPctAction(pct: number): Promise<CommissionSaveResult> {
  await requireNetworkAdmin();
  const value = pctOrError(pct);
  if (value === null) return { ok: false, message: "Informe um percentual entre 0 e 100." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("commission_settings")
    .upsert({ id: true, products_pct: value, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) {
    console.error("[admin] products pct:", error.code);
    return { ok: false, message: "Não foi possível salvar. Tente novamente." };
  }
  revalidatePath("/admin/comissoes");
  return { ok: true };
}

export type BarberOverrideInput = {
  barberId: string;
  /** % próprio de serviços; null = tabela da rede. */
  servicesPct: number | null;
  /** % próprio de produtos; null = % da rede. */
  productsPct: number | null;
};

/** Salva o % próprio de cada profissional (null volta para a regra da rede). */
export async function saveBarberOverridesAction(rows: BarberOverrideInput[]): Promise<CommissionSaveResult> {
  await requireNetworkAdmin();
  if (!Array.isArray(rows) || rows.length > 500) return { ok: false, message: "Lista de profissionais inválida." };

  const parsed: { id: string; services: number | null; products: number | null }[] = [];
  for (const r of rows) {
    if (!r || !UUID.test(String(r.barberId))) return { ok: false, message: "Profissional inválido na lista." };
    const services = r.servicesPct === null ? null : pctOrError(r.servicesPct);
    const products = r.productsPct === null ? null : pctOrError(r.productsPct);
    if ((r.servicesPct !== null && services === null) || (r.productsPct !== null && products === null)) {
      return { ok: false, message: "Percentual precisa ficar entre 0 e 100. Deixe vazio para seguir a rede." };
    }
    parsed.push({ id: r.barberId, services, products });
  }

  const admin = createAdminClient();
  for (const p of parsed) {
    const { error } = await admin
      .from("barbers")
      .update({ commission_services_pct: p.services, commission_products_pct: p.products })
      .eq("id", p.id);
    if (error) {
      console.error("[admin] barber override:", error.code);
      return { ok: false, message: "Não foi possível salvar. Tente novamente." };
    }
  }
  revalidatePath("/admin/comissoes");
  return { ok: true };
}

/** Substitui a tabela progressiva da rede (só admin da rede; a RLS confere de novo). */
export async function saveCommissionBracketsAction(input: CommissionBracket[]): Promise<BracketsSaveResult> {
  await requireNetworkAdmin();
  if (!Array.isArray(input) || input.length > 40) return { ok: false, message: "Tabela inválida." };

  const rows: CommissionBracket[] = input.map((r) => ({
    minCents: Math.round(num(r?.minCents)),
    maxCents: r?.maxCents === null ? null : Math.round(num(r?.maxCents)),
    pct: Math.round(num(r?.pct) * 100) / 100,
  }));
  const error = validateBrackets(rows);
  if (error) return { ok: false, message: error };

  // Troca atômica no banco: apaga e insere na mesma transação — se algo falhar,
  // a tabela anterior continua valendo (nunca fica vazia).
  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("replace_commission_brackets", {
    p_rows: rows.map((r) => ({ min_cents: r.minCents, max_cents: r.maxCents, pct: r.pct })),
  });
  if (rpcError) {
    console.error("[admin] brackets replace:", rpcError.code);
    if (rpcError.code === "22023" && rpcError.message) return { ok: false, message: rpcError.message };
    return { ok: false, message: "Não foi possível salvar a tabela. Tente novamente." };
  }
  revalidatePath("/admin/comissoes");
  revalidatePath("/admin");
  return { ok: true };
}

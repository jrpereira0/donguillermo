"use server";

import { revalidatePath } from "next/cache";
import { requireNetworkAdmin } from "@/lib/auth/guards";
import { validateBrackets, type CommissionBracket } from "@/lib/commissions/brackets";
import { createClient } from "@/lib/supabase/server";

export type BracketsSaveResult = { ok: true } | { ok: false; message: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

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

  const supabase = await createClient();
  const { error: delError } = await supabase.from("commission_brackets").delete().gte("min_cents", 0);
  if (delError) {
    console.error("[admin] brackets delete:", delError.code);
    return { ok: false, message: "Não foi possível salvar a tabela. Tente novamente." };
  }
  const { error: insError } = await supabase.from("commission_brackets").insert(
    rows.map((r) => ({ min_cents: r.minCents, max_cents: r.maxCents, pct: r.pct })),
  );
  if (insError) {
    console.error("[admin] brackets insert:", insError.code);
    return { ok: false, message: "Não foi possível salvar a tabela. Tente novamente." };
  }
  revalidatePath("/admin/comissoes");
  revalidatePath("/admin");
  return { ok: true };
}

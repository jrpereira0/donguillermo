"use server";

import { revalidatePath } from "next/cache";
import { requireUnitArea } from "@/lib/auth/guards";
import { lookupCep, type CepResult } from "@/lib/barbers/cep";
import { collectValues } from "@/lib/barbers/form";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { isValidUnitAssetPath } from "@/lib/units/assets";
import { UNIT_ASSET_BUCKET, type UnitSettingsState } from "@/lib/units/types";
import { toFieldErrors } from "@/lib/validation/auth";
import { onlyDigits } from "@/lib/validation/barber";
import { parseOpeningHours } from "@/lib/validation/unit";
import {
  composeAddress,
  parsePhones,
  primaryPhone,
  unitSettingsSchema,
} from "@/lib/validation/unit-settings";

const ONE_HOUR = 60 * 60_000;
const GENERIC = "Não foi possível concluir a operação. Tente novamente.";
const CHECK = "Confira os campos destacados.";

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

type CurrentRow = {
  logo_path: string | null;
  cover_path: string | null;
  cep: string | null;
  street: string | null;
  city: string | null;
};

/**
 * Salva as configurações da unidade (identidade, contato, funcionamento e agenda).
 * A unidade vem do guard, nunca do formulário. Recepção e admin chegam aqui; o banco
 * confere de novo (RLS) e impede a recepção de mexer em slug, situação e exclusão.
 */
export async function updateUnitSettingsAction(
  slug: string,
  _prev: UnitSettingsState,
  formData: FormData,
): Promise<UnitSettingsState> {
  const { ctx, unit } = await requireUnitArea(slug, "configuracoes"); // toda action revalida
  const values = collectValues(formData);

  const limited = rateLimit(`unit-settings:write:${ctx.userId}`, 120, ONE_HOUR);
  if (!limited.ok) {
    return {
      status: "error",
      message: `Muitas operações seguidas. Tente novamente em ${formatRetry(limited.retryAfterSeconds)}.`,
      values,
    };
  }

  // Logo e capa: o arquivo já foi enviado ao Storage pelo navegador; aqui só se confere o caminho.
  const logoPath = str(formData, "logoPath");
  const coverPath = str(formData, "coverPath");
  for (const p of [logoPath, coverPath]) {
    if (p && !isValidUnitAssetPath(p, unit.id)) return { status: "error", message: GENERIC, values };
  }

  const parsed = unitSettingsSchema.safeParse({
    name: str(formData, "name"),
    cnpj: str(formData, "cnpj"),
    cep: str(formData, "cep"),
    street: str(formData, "street"),
    streetNumber: str(formData, "streetNumber"),
    complement: str(formData, "complement"),
    neighborhood: str(formData, "neighborhood"),
    city: str(formData, "city"),
    state: str(formData, "state"),
    slotMinutes: str(formData, "slotMinutes"),
  });
  const phones = parsePhones(str(formData, "phones"));
  const hours = parseOpeningHours(formData);

  const fieldErrors: Record<string, string> = {
    ...(parsed.success ? {} : toFieldErrors(parsed.error)),
    ...(phones.ok ? {} : phones.errors),
    ...(hours.ok ? {} : hours.errors),
  };
  if (!parsed.success || !phones.ok || !hours.ok) {
    return { status: "error", message: CHECK, values, fieldErrors };
  }
  const v = parsed.data;

  const supabase = await createClient(); // sessão do usuário: a RLS também confere
  const { data: current } = await supabase
    .from("units")
    .select("logo_path, cover_path, cep, street, city")
    .eq("id", unit.id)
    .is("deleted_at", null)
    .maybeSingle<CurrentRow>();
  if (!current) return { status: "error", message: "Unidade não encontrada.", values };

  // Endereço em uma linha (cartões do painel da rede). Se o endereço em campos ficou vazio,
  // mantém o que já existia (cadastro antigo), a menos que o usuário tenha apagado um preenchido.
  const address = composeAddress(v);
  const hadStructured = Boolean(current.cep || current.street || current.city);
  const addressPatch = address !== null || hadStructured ? { address } : {};

  const { data, error } = await supabase
    .from("units")
    .update({
      name: v.name,
      cnpj: v.cnpj,
      cep: v.cep,
      street: v.street,
      street_number: v.streetNumber,
      complement: v.complement,
      neighborhood: v.neighborhood,
      city: v.city,
      state: v.state,
      phones: phones.value,
      phone: primaryPhone(phones.value),
      opening_hours: hours.value,
      slot_minutes: v.slotMinutes,
      logo_path: logoPath || null,
      cover_path: coverPath || null,
      ...addressPatch,
    })
    .eq("id", unit.id)
    .is("deleted_at", null)
    .select("id");

  if (error || !data?.length) {
    console.error("[unit-settings] update:", error?.code);
    return { status: "error", message: error ? GENERIC : "Unidade não encontrada.", values };
  }

  // Logo/capa trocadas ou removidas: apaga os arquivos antigos (melhor esforço).
  const stale = [
    current.logo_path && current.logo_path !== (logoPath || null) ? current.logo_path : null,
    current.cover_path && current.cover_path !== (coverPath || null) ? current.cover_path : null,
  ].filter((p): p is string => p !== null);
  if (stale.length) {
    const { error: rmError } = await supabase.storage.from(UNIT_ASSET_BUCKET).remove(stale);
    if (rmError) console.error("[unit-settings] remove old assets:", rmError.message);
  }

  revalidatePath(`/u/${unit.slug}`, "layout"); // o nome aparece no menu lateral
  revalidatePath("/admin", "layout");
  return { status: "success", message: "Configurações salvas.", values };
}

/** Busca o endereço de um CEP para preencher o formulário (consulta feita no servidor). */
export async function lookupUnitCepAction(slug: string, cep: string): Promise<CepResult> {
  const { ctx } = await requireUnitArea(slug, "configuracoes");
  const r = rateLimit(`unit-settings:cep:${ctx.userId}`, 120, ONE_HOUR);
  if (!r.ok) {
    return { ok: false, message: `Muitas consultas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.` };
  }
  return lookupCep(onlyDigits(typeof cep === "string" ? cep : "").slice(0, 8));
}

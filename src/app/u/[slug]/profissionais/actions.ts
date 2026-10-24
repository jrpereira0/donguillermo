"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnitArea } from "@/lib/auth/guards";
import { collectValues } from "@/lib/barbers/form";
import { isValidPhotoPath } from "@/lib/barbers/photo";
import { provisionBarber, setBarberLoginActive, setBarberPassword } from "@/lib/barbers/provision";
import { PHOTO_BUCKET, type BarberFormState } from "@/lib/barbers/types";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { selectionFrom, syncLinks } from "@/lib/services/links";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/lib/validation/auth";
import { lookupCep, type CepResult } from "@/lib/barbers/cep";
import {
  barberDetailsSchema,
  buildSocial,
  createBarberSchema,
  fullNameOf,
  onlyDigits,
} from "@/lib/validation/barber";
import { parseAccessPassword, parseOpeningHours } from "@/lib/validation/unit";

const ONE_HOUR = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";
const GENERIC = "Não foi possível concluir a operação. Tente novamente.";
const CHECK = "Confira os campos destacados.";

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function throttled(userId: string, bucket: string, limit: number): BarberFormState | null {
  const r = rateLimit(`barbers:${bucket}:${userId}`, limit, ONE_HOUR);
  if (r.ok) return null;
  return {
    status: "error",
    message: `Muitas operações seguidas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.`,
  };
}

const detailsFrom = (form: FormData) => ({
  firstName: str(form, "firstName"),
  lastName: str(form, "lastName"),
  displayName: str(form, "displayName"),
  jobTitle: str(form, "jobTitle"),
  phone: str(form, "phone"),
  birthDate: str(form, "birthDate"),
  cnpj: str(form, "cnpj"),
  cep: str(form, "cep"),
  street: str(form, "street"),
  streetNumber: str(form, "streetNumber"),
  complement: str(form, "complement"),
  neighborhood: str(form, "neighborhood"),
  city: str(form, "city"),
  state: str(form, "state"),
  instagram: str(form, "instagram"),
  facebook: str(form, "facebook"),
  tiktok: str(form, "tiktok"),
});

/**
 * Cadastra o profissional (ficha + login). A unidade vem do guard, nunca do
 * formulário; só a recepção da unidade (ou o admin da rede) chega aqui.
 * Em sucesso redireciona para a lista.
 */
export async function createBarberAction(
  slug: string,
  _prev: BarberFormState,
  formData: FormData,
): Promise<BarberFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "profissionais"); // toda action revalida
  const values = collectValues(formData);
  const limited = throttled(ctx.userId, "create", 60);
  if (limited) return { ...limited, values };

  const id = str(formData, "id");
  const photoPath = str(formData, "photoPath");
  const serviceSel = selectionFrom(formData, "serviceIds", "serviceMinutes_");
  if (!UUID.test(id) || !serviceSel || (photoPath && !isValidPhotoPath(photoPath, unit.id, id))) {
    return { status: "error", message: GENERIC, values };
  }

  const parsed = createBarberSchema.safeParse({ ...detailsFrom(formData), email: str(formData, "email") });
  const hours = parseOpeningHours(formData, { withBreak: true });
  const pass = parseAccessPassword(str(formData, "password"), str(formData, "confirm"));

  if (!parsed.success || !hours.ok || !pass.ok) {
    return {
      status: "error",
      message: CHECK,
      values,
      fieldErrors: {
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(hours.ok ? {} : hours.errors),
        ...(pass.ok ? {} : pass.errors),
      },
    };
  }

  const v = parsed.data;
  const result = await provisionBarber({
    id,
    unitId: unit.id,
    email: v.email,
    password: pass.password,
    firstName: v.firstName,
    lastName: v.lastName,
    displayName: v.displayName,
    jobTitle: v.jobTitle,
    phone: v.phone,
    birthDate: v.birthDate,
    cnpj: v.cnpj,
    address: {
      cep: v.cep,
      street: v.street,
      streetNumber: v.streetNumber,
      complement: v.complement,
      neighborhood: v.neighborhood,
      city: v.city,
      state: v.state,
    },
    photoPath: photoPath || null,
    social: buildSocial(v),
    workHours: hours.value ?? {},
  });

  if (!result.ok) {
    return {
      status: "error",
      message: result.field ? CHECK : result.message,
      values,
      fieldErrors: result.field ? { [result.field]: result.message } : undefined,
    };
  }

  // Serviços que ele faz (sessão do usuário: a RLS confere a unidade). Falha não desfaz o cadastro.
  const linked = await syncLinks(await createClient(), unit.id, "barber", id, serviceSel);

  revalidatePath(`/u/${unit.slug}/profissionais`);
  redirect(`/u/${unit.slug}/profissionais?aviso=${linked ? "criado" : "parcial"}`);
}

/** Atualiza a ficha do profissional (unidade e login nunca mudam por aqui). */
export async function updateBarberAction(
  slug: string,
  barberId: string,
  _prev: BarberFormState,
  formData: FormData,
): Promise<BarberFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "profissionais");
  const values = collectValues(formData);
  const limited = throttled(ctx.userId, "write", 120);
  if (limited) return { ...limited, values };
  if (!UUID.test(barberId)) return { status: "error", message: GENERIC, values };

  const photoPath = str(formData, "photoPath");
  const serviceSel = selectionFrom(formData, "serviceIds", "serviceMinutes_");
  if (!serviceSel || (photoPath && !isValidPhotoPath(photoPath, unit.id, barberId))) {
    return { status: "error", message: GENERIC, values };
  }

  const parsed = barberDetailsSchema.safeParse(detailsFrom(formData));
  const hours = parseOpeningHours(formData, { withBreak: true });
  if (!parsed.success || !hours.ok) {
    return {
      status: "error",
      message: CHECK,
      values,
      fieldErrors: {
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(hours.ok ? {} : hours.errors),
      },
    };
  }
  const v = parsed.data;

  const supabase = await createClient(); // sessão do usuário: a RLS também confere
  const { data: current } = await supabase
    .from("barbers")
    .select("photo_path")
    .eq("id", barberId)
    .eq("unit_id", unit.id)
    .maybeSingle<{ photo_path: string | null }>();
  if (!current) return { status: "error", message: "Profissional não encontrado.", values };

  const { data, error } = await supabase
    .from("barbers")
    .update({
      full_name: fullNameOf(v.firstName, v.lastName),
      first_name: v.firstName,
      last_name: v.lastName,
      display_name: v.displayName,
      job_title: v.jobTitle,
      phone: v.phone,
      birth_date: v.birthDate,
      cnpj: v.cnpj,
      cep: v.cep,
      street: v.street,
      street_number: v.streetNumber,
      complement: v.complement,
      neighborhood: v.neighborhood,
      city: v.city,
      state: v.state,
      photo_path: photoPath || null,
      social: buildSocial(v),
      work_hours: hours.value ?? {},
    })
    .eq("id", barberId)
    .eq("unit_id", unit.id)
    .select("id");

  if (error || !data?.length) {
    if (error?.code === UNIQUE_VIOLATION) {
      return {
        status: "error",
        message: CHECK,
        values,
        fieldErrors: { cnpj: "Já existe um profissional com este CNPJ nesta unidade." },
      };
    }
    console.error("[barbers] update:", error?.code);
    return { status: "error", message: error ? GENERIC : "Profissional não encontrado.", values };
  }

  // Foto trocada ou removida: apaga o arquivo antigo (melhor esforço).
  if (current.photo_path && current.photo_path !== (photoPath || null)) {
    const { error: rmError } = await supabase.storage.from(PHOTO_BUCKET).remove([current.photo_path]);
    if (rmError) console.error("[barbers] remove old photo:", rmError.message);
  }

  const linked = await syncLinks(supabase, unit.id, "barber", barberId, serviceSel);

  revalidatePath(`/u/${unit.slug}/profissionais`);
  if (!linked) {
    return {
      status: "error",
      message: "Os dados foram salvos, mas não foi possível atualizar os serviços. Tente salvar de novo.",
      values,
    };
  }
  return { status: "success", message: "Alterações salvas.", values };
}

/** Define nova senha para o login do profissional (quem define é a recepção). */
export async function changeBarberPasswordAction(
  slug: string,
  barberId: string,
  _prev: BarberFormState,
  formData: FormData,
): Promise<BarberFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "profissionais");
  const limited = throttled(ctx.userId, "access", 30);
  if (limited) return limited;
  if (!UUID.test(barberId)) return { status: "error", message: GENERIC };

  const pass = parseAccessPassword(str(formData, "password"), str(formData, "confirm"));
  if (!pass.ok) return { status: "error", message: CHECK, fieldErrors: pass.errors };

  // Confere pela sessão (RLS) que o profissional é desta unidade antes de usar a service_role.
  const supabase = await createClient();
  const { data: barber } = await supabase
    .from("barbers")
    .select("id")
    .eq("id", barberId)
    .eq("unit_id", unit.id)
    .maybeSingle();
  if (!barber) return { status: "error", message: "Profissional não encontrado." };

  const result = await setBarberPassword({ unitId: unit.id, barberId, password: pass.password });
  return { status: result.ok ? "success" : "error", message: result.message };
}

/** Ativa/desativa o profissional; desativado também perde o acesso ao sistema. */
export async function toggleBarberActiveAction(
  slug: string,
  barberId: string,
  active: boolean,
): Promise<void> {
  const { ctx, unit } = await requireUnitArea(slug, "profissionais");
  if (!UUID.test(barberId) || throttled(ctx.userId, "write", 120)) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("barbers")
    .update({ is_active: active })
    .eq("id", barberId)
    .eq("unit_id", unit.id)
    .select("user_id");
  if (error) console.error("[barbers] toggle:", error.code);
  const userId = data?.[0]?.user_id ?? null;
  if (data?.length) await setBarberLoginActive({ unitId: unit.id, userId, active });

  revalidatePath(`/u/${unit.slug}/profissionais`);
}

/** Busca o endereço de um CEP para preencher o formulário (consulta feita no servidor). */
export async function lookupCepAction(slug: string, cep: string): Promise<CepResult> {
  const { ctx } = await requireUnitArea(slug, "profissionais");
  const r = rateLimit(`barbers:cep:${ctx.userId}`, 120, ONE_HOUR);
  if (!r.ok) {
    return { ok: false, message: `Muitas consultas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.` };
  }
  return lookupCep(onlyDigits(typeof cep === "string" ? cep : "").slice(0, 8));
}

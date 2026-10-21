"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnitArea } from "@/lib/auth/guards";
import { lookupCep, type CepResult } from "@/lib/barbers/cep";
import { collectValues } from "@/lib/barbers/form";
import { isValidCustomerPhotoPath } from "@/lib/customers/photo";
import { CUSTOMER_PHOTO_BUCKET, type CustomerFormState } from "@/lib/customers/types";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/lib/validation/auth";
import { onlyDigits } from "@/lib/validation/barber";
import { customerSchema, noteSchema } from "@/lib/validation/customer";

const ONE_HOUR = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";
const GENERIC = "Não foi possível concluir a operação. Tente novamente.";
const CHECK = "Confira os campos destacados.";
const DUPLICATE_CPF = "Já existe um cliente com este CPF.";
const DUPLICATE_PHONE = "Já existe um cliente com este telefone.";

/** Traduz a violação de unicidade (23505) para o campo certo (telefone ou CPF). */
function duplicateField(error: { code?: string; message?: string; details?: string } | null): "cpf" | "phone" | null {
  if (!error || error.code !== UNIQUE_VIOLATION) return null;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (text.includes("phone")) return "phone";
  if (text.includes("cpf")) return "cpf";
  return null;
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

/** Telefone é único na rede: devolve o cliente que já usa este telefone (se houver). */
async function customerWithPhone(supabase: SupabaseLike, phone: string, exceptId?: string) {
  let query = supabase.from("customers").select("id, full_name").eq("phone", phone);
  if (exceptId) query = query.neq("id", exceptId);
  const { data } = await query.maybeSingle<{ id: string; full_name: string }>();
  return data;
}

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function throttled(userId: string, bucket: string, limit: number): CustomerFormState | null {
  const r = rateLimit(`customers:${bucket}:${userId}`, limit, ONE_HOUR);
  if (r.ok) return null;
  return {
    status: "error",
    message: `Muitas operações seguidas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.`,
  };
}

const detailsFrom = (form: FormData) => ({
  fullName: str(form, "fullName"),
  phone: str(form, "phone"),
  email: str(form, "email"),
  birthDate: str(form, "birthDate"),
  cpf: str(form, "cpf"),
  cep: str(form, "cep"),
  street: str(form, "street"),
  streetNumber: str(form, "streetNumber"),
  complement: str(form, "complement"),
  neighborhood: str(form, "neighborhood"),
  city: str(form, "city"),
  state: str(form, "state"),
  referralSource: str(form, "referralSource"),
  marketingConsent: str(form, "marketingConsent"),
});

type Details = ReturnType<typeof customerSchema.parse>;

/** Colunas editáveis a partir dos dados já validados (o que cria e o que atualiza usam o mesmo mapa). */
const columnsFrom = (v: Details) => ({
  full_name: v.fullName,
  phone: v.phone,
  email: v.email,
  birth_date: v.birthDate,
  cpf: v.cpf,
  cep: v.cep,
  street: v.street,
  street_number: v.streetNumber,
  complement: v.complement,
  neighborhood: v.neighborhood,
  city: v.city,
  state: v.state,
  referral_source: v.referralSource,
  marketing_consent: v.marketingConsent,
});

/**
 * Cadastra o cliente (cadastro único da rede). A unidade de origem vem do guard, nunca do
 * formulário; recepção de qualquer unidade (ou o admin) chega aqui, e a RLS confere de novo.
 * Em sucesso redireciona para a lista.
 */
export async function createCustomerAction(
  slug: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "clientes"); // toda action revalida
  const values = collectValues(formData);
  const limited = throttled(ctx.userId, "write", 120);
  if (limited) return { ...limited, values };

  // O id nasce no formulário para o arquivo da foto já ter nome antes do cadastro.
  const id = str(formData, "id");
  const photoPath = str(formData, "photoPath");
  if (!UUID.test(id) || (photoPath && !isValidCustomerPhotoPath(photoPath, id))) {
    return { status: "error", message: GENERIC, values };
  }

  const parsed = customerSchema.safeParse(detailsFrom(formData));
  if (!parsed.success) {
    return { status: "error", message: CHECK, values, fieldErrors: toFieldErrors(parsed.error) };
  }
  const v = parsed.data;

  const supabase = await createClient();
  if (v.phone) {
    const existing = await customerWithPhone(supabase, v.phone);
    if (existing) {
      return {
        status: "error",
        message: CHECK,
        values,
        fieldErrors: { phone: `${DUPLICATE_PHONE} Cadastro existente: ${existing.full_name}.` },
      };
    }
  }
  const { error } = await supabase.from("customers").insert({
    id,
    created_unit_id: unit.id,
    photo_path: photoPath || null,
    consent_at: v.marketingConsent ? new Date().toISOString() : null,
    ...columnsFrom(v),
  });
  if (error) {
    const dup = duplicateField(error);
    if (dup === "phone") return { status: "error", message: CHECK, values, fieldErrors: { phone: DUPLICATE_PHONE } };
    if (dup === "cpf") return { status: "error", message: CHECK, values, fieldErrors: { cpf: DUPLICATE_CPF } };
    console.error("[customers] insert:", error.code);
    return { status: "error", message: GENERIC, values };
  }

  revalidatePath(`/u/${unit.slug}/clientes`);
  redirect(`/u/${unit.slug}/clientes?aviso=criado`);
}

/** Atualiza o cliente (unidade de origem e forma de cadastro nunca mudam). */
export async function updateCustomerAction(
  slug: string,
  customerId: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "clientes");
  const values = collectValues(formData);
  const limited = throttled(ctx.userId, "write", 120);
  if (limited) return { ...limited, values };
  if (!UUID.test(customerId)) return { status: "error", message: GENERIC, values };

  const photoPath = str(formData, "photoPath");
  if (photoPath && !isValidCustomerPhotoPath(photoPath, customerId)) {
    return { status: "error", message: GENERIC, values };
  }

  const parsed = customerSchema.safeParse(detailsFrom(formData));
  if (!parsed.success) {
    return { status: "error", message: CHECK, values, fieldErrors: toFieldErrors(parsed.error) };
  }
  const v = parsed.data;

  const supabase = await createClient(); // sessão do usuário: a RLS também confere
  const { data: current } = await supabase
    .from("customers")
    .select("photo_path, marketing_consent, consent_at")
    .eq("id", customerId)
    .maybeSingle<{ photo_path: string | null; marketing_consent: boolean; consent_at: string | null }>();
  if (!current) return { status: "error", message: "Cliente não encontrado.", values };

  // A data do consentimento muda só quando o consentimento muda.
  const consentAt = !v.marketingConsent
    ? null
    : current.marketing_consent && current.consent_at
      ? current.consent_at
      : new Date().toISOString();

  if (v.phone) {
    const existing = await customerWithPhone(supabase, v.phone, customerId);
    if (existing) {
      return {
        status: "error",
        message: CHECK,
        values,
        fieldErrors: { phone: `${DUPLICATE_PHONE} Cadastro existente: ${existing.full_name}.` },
      };
    }
  }

  const { data, error } = await supabase
    .from("customers")
    .update({ photo_path: photoPath || null, consent_at: consentAt, ...columnsFrom(v) })
    .eq("id", customerId)
    .select("id");

  if (error || !data?.length) {
    const dup = duplicateField(error);
    if (dup === "phone") return { status: "error", message: CHECK, values, fieldErrors: { phone: DUPLICATE_PHONE } };
    if (dup === "cpf") return { status: "error", message: CHECK, values, fieldErrors: { cpf: DUPLICATE_CPF } };
    console.error("[customers] update:", error?.code);
    return { status: "error", message: error ? GENERIC : "Cliente não encontrado.", values };
  }

  // Foto trocada ou removida: apaga o arquivo antigo (melhor esforço).
  if (current.photo_path && current.photo_path !== (photoPath || null)) {
    const { error: rmError } = await supabase.storage.from(CUSTOMER_PHOTO_BUCKET).remove([current.photo_path]);
    if (rmError) console.error("[customers] remove old photo:", rmError.message);
  }

  revalidatePath(`/u/${unit.slug}/clientes`);
  return { status: "success", message: "Alterações salvas.", values };
}

/** Ativa/desativa o cliente (desativado some da busca padrão; o histórico fica). */
export async function toggleCustomerActiveAction(slug: string, customerId: string, active: boolean): Promise<void> {
  const { ctx, unit } = await requireUnitArea(slug, "clientes");
  if (!UUID.test(customerId) || throttled(ctx.userId, "toggle", 240)) return;

  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ is_active: active }).eq("id", customerId);
  if (error) console.error("[customers] toggle:", error.code);

  revalidatePath(`/u/${unit.slug}/clientes`);
}

/** Busca o endereço de um CEP para preencher o formulário (consulta feita no servidor). */
export async function lookupCustomerCepAction(slug: string, cep: string): Promise<CepResult> {
  const { ctx } = await requireUnitArea(slug, "clientes");
  const r = rateLimit(`customers:cep:${ctx.userId}`, 120, ONE_HOUR);
  if (!r.ok) {
    return { ok: false, message: `Muitas consultas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.` };
  }
  return lookupCep(onlyDigits(typeof cep === "string" ? cep : "").slice(0, 8));
}

/** Adiciona uma observação à lista do cliente (a unidade e o autor vêm da sessão, não do formulário). */
export async function addCustomerNoteAction(
  slug: string,
  customerId: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "clientes");
  const limited = throttled(ctx.userId, "note", 120);
  if (limited) return limited;
  if (!UUID.test(customerId)) return { status: "error", message: GENERIC };

  const parsed = noteSchema.safeParse({ body: str(formData, "body") });
  if (!parsed.success) {
    return { status: "error", message: CHECK, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customer_notes")
    .insert({ customer_id: customerId, unit_id: unit.id, body: parsed.data.body });
  if (error) {
    console.error("[customers] note insert:", error.code);
    return { status: "error", message: GENERIC };
  }

  revalidatePath(`/u/${unit.slug}/clientes/${customerId}`);
  return { status: "success", message: "Observação salva." };
}

/** Edita o texto de uma observação (autor, unidade e data de criação não mudam). */
export async function updateCustomerNoteAction(
  slug: string,
  customerId: string,
  noteId: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "clientes");
  const limited = throttled(ctx.userId, "note", 120);
  if (limited) return limited;
  if (!UUID.test(customerId) || !UUID.test(noteId)) return { status: "error", message: GENERIC };

  const parsed = noteSchema.safeParse({ body: str(formData, "body") });
  if (!parsed.success) {
    return { status: "error", message: CHECK, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_notes")
    .update({ body: parsed.data.body })
    .eq("id", noteId)
    .eq("customer_id", customerId)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("[customers] note update:", error.code);
    return { status: "error", message: error ? GENERIC : "Observação não encontrada." };
  }

  revalidatePath(`/u/${unit.slug}/clientes/${customerId}`);
  return { status: "success", message: "Observação atualizada." };
}

/** Exclui uma observação da lista do cliente. */
export async function deleteCustomerNoteAction(
  slug: string,
  customerId: string,
  noteId: string,
): Promise<CustomerFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "clientes");
  const limited = throttled(ctx.userId, "note", 120);
  if (limited) return limited;
  if (!UUID.test(customerId) || !UUID.test(noteId)) return { status: "error", message: GENERIC };

  const supabase = await createClient();
  const { error } = await supabase.from("customer_notes").delete().eq("id", noteId).eq("customer_id", customerId);
  if (error) {
    console.error("[customers] note delete:", error.code);
    return { status: "error", message: GENERIC };
  }

  revalidatePath(`/u/${unit.slug}/clientes/${customerId}`);
  return { status: "success", message: "Observação excluída." };
}

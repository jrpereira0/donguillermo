"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnitArea } from "@/lib/auth/guards";
import { collectValues } from "@/lib/barbers/form";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { isValidServiceImagePath } from "@/lib/services/image";
import { selectionFrom, syncLinks } from "@/lib/services/links";
import { SERVICE_IMAGE_BUCKET, type ServiceFormState } from "@/lib/services/types";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/lib/validation/auth";
import { serviceSchema } from "@/lib/validation/service";

const ONE_HOUR = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";
const GENERIC = "Não foi possível concluir a operação. Tente novamente.";
const CHECK = "Confira os campos destacados.";
const DUPLICATE = "Já existe um serviço com este nome nesta unidade.";

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function throttled(userId: string, limit: number): ServiceFormState | null {
  const r = rateLimit(`services:${userId}`, limit, ONE_HOUR);
  if (r.ok) return null;
  return {
    status: "error",
    message: `Muitas operações seguidas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.`,
  };
}

const detailsFrom = (form: FormData) => ({
  name: str(form, "name"),
  category: str(form, "category"),
  description: str(form, "description"),
  duration: str(form, "duration"),
  price: str(form, "price"),
});

/**
 * Cadastra o serviço. A unidade vem do guard, nunca do formulário; só a recepção da
 * unidade (ou o admin da rede) chega aqui, e a RLS confere de novo no banco.
 * Em sucesso redireciona para a lista.
 */
export async function createServiceAction(
  slug: string,
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "servicos"); // toda action revalida
  const values = collectValues(formData);
  const limited = throttled(ctx.userId, 120);
  if (limited) return { ...limited, values };

  // O id nasce no formulário para o arquivo da imagem já ter nome antes do cadastro.
  const id = str(formData, "id");
  const imagePath = str(formData, "imagePath");
  const barberIds = selectionFrom(formData, "barberIds", "barberMinutes_");
  if (!UUID.test(id) || !barberIds || (imagePath && !isValidServiceImagePath(imagePath, unit.id, id))) {
    return { status: "error", message: GENERIC, values };
  }

  const parsed = serviceSchema.safeParse(detailsFrom(formData));
  if (!parsed.success) {
    return { status: "error", message: CHECK, values, fieldErrors: toFieldErrors(parsed.error) };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({
    id,
    unit_id: unit.id,
    image_path: imagePath || null,
    name: v.name,
    description: v.description,
    category: v.category,
    duration_minutes: v.duration,
    price_cents: v.price,
  });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { status: "error", message: CHECK, values, fieldErrors: { name: DUPLICATE } };
    }
    console.error("[services] insert:", error.code);
    return { status: "error", message: GENERIC, values };
  }

  const linked = await syncLinks(supabase, unit.id, "service", id, barberIds);

  revalidatePath(`/u/${unit.slug}/servicos`);
  redirect(`/u/${unit.slug}/servicos?aviso=${linked ? "criado" : "parcial"}`);
}

/** Atualiza o serviço (a unidade nunca muda por aqui). */
export async function updateServiceAction(
  slug: string,
  serviceId: string,
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "servicos");
  const values = collectValues(formData);
  const limited = throttled(ctx.userId, 120);
  if (limited) return { ...limited, values };
  if (!UUID.test(serviceId)) return { status: "error", message: GENERIC, values };
  const imagePath = str(formData, "imagePath");
  const barberIds = selectionFrom(formData, "barberIds", "barberMinutes_");
  if (!barberIds || (imagePath && !isValidServiceImagePath(imagePath, unit.id, serviceId))) {
    return { status: "error", message: GENERIC, values };
  }

  const parsed = serviceSchema.safeParse(detailsFrom(formData));
  if (!parsed.success) {
    return { status: "error", message: CHECK, values, fieldErrors: toFieldErrors(parsed.error) };
  }
  const v = parsed.data;

  const supabase = await createClient(); // sessão do usuário: a RLS também confere

  // Imagem salva hoje (para apagar o arquivo antigo se mudou ou foi removida).
  const { data: current } = await supabase
    .from("services")
    .select("image_path")
    .eq("id", serviceId)
    .eq("unit_id", unit.id)
    .maybeSingle<{ image_path: string | null }>();

  const { data, error } = await supabase
    .from("services")
    .update({
      image_path: imagePath || null,
      name: v.name,
      description: v.description,
      category: v.category,
      duration_minutes: v.duration,
      price_cents: v.price,
    })
    .eq("id", serviceId)
    .eq("unit_id", unit.id)
    .select("id");

  if (error || !data?.length) {
    if (error?.code === UNIQUE_VIOLATION) {
      return { status: "error", message: CHECK, values, fieldErrors: { name: DUPLICATE } };
    }
    console.error("[services] update:", error?.code);
    return { status: "error", message: error ? GENERIC : "Serviço não encontrado.", values };
  }

  if (current?.image_path && current.image_path !== (imagePath || null)) {
    const { error: rmError } = await supabase.storage.from(SERVICE_IMAGE_BUCKET).remove([current.image_path]);
    if (rmError) console.error("[services] remove old image:", rmError.message);
  }

  const linked = await syncLinks(supabase, unit.id, "service", serviceId, barberIds);

  revalidatePath(`/u/${unit.slug}/servicos`);
  if (!linked) {
    return {
      status: "error",
      message: "Os dados foram salvos, mas não foi possível atualizar os profissionais. Tente salvar de novo.",
      values,
    };
  }
  return { status: "success", message: "Alterações salvas.", values };
}

/** Ativa/desativa o serviço (desativado some das listas e da agenda; o histórico fica). */
export async function toggleServiceActiveAction(slug: string, serviceId: string, active: boolean): Promise<void> {
  const { ctx, unit } = await requireUnitArea(slug, "servicos");
  if (!UUID.test(serviceId) || throttled(ctx.userId, 240)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ is_active: active })
    .eq("id", serviceId)
    .eq("unit_id", unit.id);
  if (error) console.error("[services] toggle:", error.code);

  revalidatePath(`/u/${unit.slug}/servicos`);
}

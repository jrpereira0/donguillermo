"use server";

import { revalidatePath } from "next/cache";
import { provisionReception, setReceptionPassword } from "@/lib/admin/reception";
import type { AdminFormState } from "@/lib/admin/state";
import { requireNetworkAdmin } from "@/lib/auth/guards";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/lib/validation/auth";
import {
  createUnitSchema,
  inviteReceptionSchema,
  parseAccessPassword,
  parseOpeningHours,
} from "@/lib/validation/unit";

const ONE_HOUR = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres: violação de UNIQUE. */
const UNIQUE_VIOLATION = "23505";

const GENERIC = "Não foi possível concluir a operação. Tente novamente.";

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

/** Lê e valida a senha (e a confirmação) do formulário. */
function readPassword(form: FormData) {
  return parseAccessPassword(str(form, "password"), str(form, "confirm"));
}

/** Limite de operações sensíveis por administrador. */
function throttled(userId: string, bucket: string, limit: number): AdminFormState | null {
  const r = rateLimit(`admin:${bucket}:${userId}`, limit, ONE_HOUR);
  if (r.ok) return null;
  return {
    status: "error",
    message: `Muitas operações seguidas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.`,
  };
}

/** Cria a unidade e provisiona o acesso da recepção. */
export async function createUnitAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const ctx = await requireNetworkAdmin(); // toda action revalida: o layout não protege chamadas diretas
  const limited = throttled(ctx.userId, "unit-create", 30);
  if (limited) return limited;

  const parsed = createUnitSchema.safeParse({
    name: str(formData, "name"),
    slug: str(formData, "slug"),
    address: str(formData, "address"),
    phone: str(formData, "phone"),
    receptionEmail: str(formData, "receptionEmail"),
    receptionName: str(formData, "receptionName"),
  });
  const hours = parseOpeningHours(formData);
  const pass = readPassword(formData);

  const fieldErrors: Record<string, string> = {
    ...(parsed.success ? {} : toFieldErrors(parsed.error)),
    ...(hours.ok ? {} : hours.errors),
    ...(pass.ok ? {} : pass.errors),
  };
  // A senha é validada ANTES de criar a unidade, para não deixar unidade pela metade.
  if (Object.keys(fieldErrors).length || !parsed.success || !hours.ok || !pass.ok) {
    return { status: "error", message: "Confira os campos destacados.", fieldErrors };
  }

  const v = parsed.data;
  const supabase = await createClient(); // sessão do admin: a RLS também confere
  const { data: unit, error } = await supabase
    .from("units")
    .insert({
      slug: v.slug,
      name: v.name,
      address: v.address,
      phone: v.phone,
      opening_hours: hours.value,
    })
    .select("id, slug")
    .single();

  if (error || !unit) {
    if (error?.code === UNIQUE_VIOLATION) {
      return {
        status: "error",
        message: "Confira os campos destacados.",
        fieldErrors: { slug: "Já existe uma unidade com este endereço (slug)." },
      };
    }
    console.error("[admin] create unit:", error?.code);
    return { status: "error", message: GENERIC };
  }

  // Passo 2 do plano (copiar catálogo padrão de serviços/produtos) entra aqui
  // quando essas tabelas existirem (fase de cadastros).

  const access = await provisionReception({
    unitId: unit.id,
    email: v.receptionEmail,
    fullName: v.receptionName,
    password: pass.password,
  });

  revalidatePath("/admin", "layout");

  if (!access.ok) {
    return {
      status: "error",
      createdSlug: unit.slug,
      message: `A unidade foi criada, mas o acesso da recepção falhou: ${access.message} Crie o acesso pela página da unidade.`,
    };
  }
  return {
    status: "success",
    createdSlug: unit.slug,
    message: `Unidade criada. ${access.message}`,
  };
}

/** Ativa ou desativa a unidade (desativada: recepção e barbeiros perdem o acesso). */
export async function toggleUnitActiveAction(
  id: string,
  active: boolean,
): Promise<void> {
  await requireNetworkAdmin();
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("units").update({ is_active: active }).eq("id", id);
  if (error) console.error("[admin] toggle unit:", error.code);
  revalidatePath("/admin", "layout");
}

/** Cria o acesso (com senha) de uma recepção numa unidade existente. */
export async function inviteReceptionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const ctx = await requireNetworkAdmin();
  const limited = throttled(ctx.userId, "access", 30);
  if (limited) return limited;

  const unitId = str(formData, "unitId");
  const parsed = inviteReceptionSchema.safeParse({
    email: str(formData, "email"),
    fullName: str(formData, "fullName"),
  });
  if (!UUID.test(unitId)) return { status: "error", message: GENERIC };
  const pass = readPassword(formData);
  if (!parsed.success || !pass.ok) {
    return {
      status: "error",
      message: "Confira os campos destacados.",
      fieldErrors: {
        ...(parsed.success ? {} : toFieldErrors(parsed.error)),
        ...(pass.ok ? {} : pass.errors),
      },
    };
  }

  const supabase = await createClient();
  const { data: unit } = await supabase
    .from("units")
    .select("id")
    .eq("id", unitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!unit) return { status: "error", message: "Unidade não encontrada." };

  const access = await provisionReception({
    unitId,
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    password: pass.password,
  });
  revalidatePath("/admin", "layout");
  return access.ok
    ? { status: "success", message: access.message }
    : { status: "error", message: access.message };
}

/** Altera a senha de uma recepção (quem define é o administrador). */
export async function changeReceptionPasswordAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const ctx = await requireNetworkAdmin();
  const limited = throttled(ctx.userId, "access", 30);
  if (limited) return limited;

  const memberId = str(formData, "memberId");
  if (!UUID.test(memberId)) return { status: "error", message: GENERIC };
  const pass = readPassword(formData);
  if (!pass.ok) {
    return {
      status: "error",
      message: "Confira os campos destacados.",
      fieldErrors: pass.errors,
    };
  }

  // O e-mail vem do banco (não do formulário): o admin não digita nem troca o destino.
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("unit_members")
    .select("role, profiles(email)")
    .eq("id", memberId)
    .eq("role", "recepcao")
    .maybeSingle<{ role: string; profiles: { email: string } | null }>();
  const email = member?.profiles?.email;
  if (!email) return { status: "error", message: "Recepção não encontrada." };

  const result = await setReceptionPassword({ email, password: pass.password });
  return { status: result.ok ? "success" : "error", message: result.message };
}

/** Ativa ou desativa o vínculo de uma recepção com a unidade. */
export async function toggleMemberActiveAction(
  memberId: string,
  active: boolean,
): Promise<void> {
  await requireNetworkAdmin();
  if (!UUID.test(memberId)) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("unit_members")
    .update({ is_active: active })
    .eq("id", memberId)
    .eq("role", "recepcao");
  if (error) console.error("[admin] toggle member:", error.code);
  revalidatePath("/admin", "layout");
}

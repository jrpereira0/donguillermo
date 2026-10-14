import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fullNameOf } from "@/lib/validation/barber";

export type ProvisionResult = { ok: true; message: string } | { ok: false; message: string };

export type NewBarber = {
  id: string; // gerado no formulário (a foto já usa este id no caminho)
  unitId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string;
  phone: string | null;
  birthDate: string | null;
  cnpj: string | null;
  address: {
    cep: string | null;
    street: string | null;
    streetNumber: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  };
  photoPath: string | null;
  social: Record<string, string>;
  commissionServices: number;
  commissionProducts: number;
  workHours: unknown;
};

const UNIQUE_VIOLATION = "23505";

/**
 * Cria o barbeiro COM login: conta de acesso + vínculo `barbeiro` + ficha.
 * Usa a service_role: SÓ pode ser chamada depois de `requireUnitArea(slug, "profissionais")`
 * e com `unitId` vindo do guard (nunca do formulário).
 *
 * - E-mail que já tem conta é RECUSADO (não vinculamos nem trocamos a senha de
 *   quem já existe: evita tomar conta de outra pessoa/papel).
 * - Se algo falhar no meio, desfaz o que foi criado (sem conta órfã).
 * - Nunca registra senha em log.
 */
export async function provisionBarber(b: NewBarber): Promise<ProvisionResult & { field?: string }> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", b.email)
    .maybeSingle();
  if (existing) {
    return {
      ok: false,
      field: "email",
      message: "Já existe uma conta com este e-mail. Use outro e-mail para o login do profissional.",
    };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: b.email,
    password: b.password,
    email_confirm: true,
    user_metadata: { full_name: fullNameOf(b.firstName, b.lastName) },
  });
  if (createError || !created.user) {
    console.error("[barbers] createUser:", createError?.status, createError?.code);
    if (createError?.code === "email_exists") {
      return { ok: false, field: "email", message: "Já existe uma conta com este e-mail." };
    }
    return { ok: false, message: "Não foi possível criar o login. Confira os dados e tente novamente." };
  }
  const userId = created.user.id;

  const rollback = async () => {
    // Apagar a conta remove profile e vínculos em cascata.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("[barbers] rollback deleteUser:", error.status, error.code);
  };

  const { error: memberError } = await admin
    .from("unit_members")
    .insert({ user_id: userId, unit_id: b.unitId, role: "barbeiro" });
  if (memberError) {
    console.error("[barbers] insert unit_members:", memberError.code);
    await rollback();
    return { ok: false, message: "Não foi possível vincular o profissional à unidade." };
  }

  const { error: barberError } = await admin.from("barbers").insert({
    id: b.id,
    unit_id: b.unitId,
    user_id: userId,
    full_name: fullNameOf(b.firstName, b.lastName),
    first_name: b.firstName,
    last_name: b.lastName,
    display_name: b.displayName,
    job_title: b.jobTitle,
    phone: b.phone,
    birth_date: b.birthDate,
    cnpj: b.cnpj,
    cep: b.address.cep,
    street: b.address.street,
    street_number: b.address.streetNumber,
    complement: b.address.complement,
    neighborhood: b.address.neighborhood,
    city: b.address.city,
    state: b.address.state,
    photo_path: b.photoPath,
    social: b.social,
    commission_services_pct: b.commissionServices,
    commission_products_pct: b.commissionProducts,
    work_hours: b.workHours,
  });
  if (barberError) {
    console.error("[barbers] insert barber:", barberError.code);
    await rollback();
    if (barberError.code === UNIQUE_VIOLATION) {
      return { ok: false, field: "cnpj", message: "Já existe um profissional com este CNPJ nesta unidade." };
    }
    return { ok: false, message: "Não foi possível salvar o profissional." };
  }

  return { ok: true, message: "Profissional cadastrado." };
}

/**
 * Nova senha do login do barbeiro. Só aceita conta que seja EXCLUSIVAMENTE de
 * barbeiro (nunca troca senha de recepção/admin por esta tela) e que pertença
 * a esta unidade. `unitId` vem do guard.
 */
export async function setBarberPassword(input: {
  unitId: string;
  barberId: string;
  password: string;
}): Promise<ProvisionResult> {
  const admin = createAdminClient();

  const { data: barber } = await admin
    .from("barbers")
    .select("user_id")
    .eq("id", input.barberId)
    .eq("unit_id", input.unitId)
    .maybeSingle();
  if (!barber?.user_id) return { ok: false, message: "Este profissional não tem login." };

  const { data: roles } = await admin
    .from("unit_members")
    .select("role")
    .eq("user_id", barber.user_id);
  if (!roles?.length || roles.some((r) => r.role !== "barbeiro")) {
    return { ok: false, message: "Este login não pode ser alterado por aqui." };
  }

  const { error } = await admin.auth.admin.updateUserById(barber.user_id, {
    password: input.password,
    email_confirm: true,
  });
  if (error) {
    console.error("[barbers] updateUserById(password):", error.status, error.code);
    return { ok: false, message: "Não foi possível alterar a senha." };
  }
  return {
    ok: true,
    message: "Senha alterada. Passe a nova senha ao profissional por um canal seguro.",
  };
}

/** Liga/desliga o acesso (vínculo) do barbeiro junto com o status da ficha. */
export async function setBarberLoginActive(input: {
  unitId: string;
  userId: string | null;
  active: boolean;
}): Promise<void> {
  if (!input.userId) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from("unit_members")
    .update({ is_active: input.active })
    .eq("user_id", input.userId)
    .eq("unit_id", input.unitId)
    .eq("role", "barbeiro");
  if (error) console.error("[barbers] toggle member:", error.code);
}

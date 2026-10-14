import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AccessResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Cria (ou reaproveita) a conta da recepção e a vincula à unidade, com a senha
 * definida pelo administrador (conta já confirmada, sem e-mail).
 * Usa a service_role: SÓ pode ser chamada depois de `requireNetworkAdmin()`.
 *
 * - E-mail novo: cria a conta com a senha informada.
 * - E-mail já existente: só cria o vínculo; a senha informada é IGNORADA (não
 *   trocamos senha de conta existente aqui; para isso use "Alterar senha").
 *
 * `password` deve vir validada (política forte). Nunca é registrada em log.
 */
export async function provisionReception(input: {
  unitId: string;
  email: string;
  fullName: string | null;
  password: string;
}): Promise<AccessResult> {
  const admin = createAdminClient();
  const { unitId, email, fullName, password } = input;

  const { data: existing } = await admin
    .from("profiles")
    .select("id, is_active")
    .eq("email", email)
    .maybeSingle();

  let userId = existing?.id as string | undefined;
  let created = false;

  if (existing) {
    if (!existing.is_active) {
      return { ok: false, message: "Esta conta está inativa e não pode receber acesso." };
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // sem convite: a conta já nasce confirmada
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (error || !data.user) {
      // Só status/código: nunca a senha nem a mensagem completa.
      console.error("[admin] createUser:", error?.status, error?.code);
      return {
        ok: false,
        message: "Não foi possível criar a conta. Confira os dados e tente novamente.",
      };
    }
    userId = data.user.id;
    created = true;
  }

  if (!userId) return { ok: false, message: "Não foi possível identificar a conta." };

  // Vínculo (idempotente): reativa se já existia.
  const { data: member } = await admin
    .from("unit_members")
    .select("id")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .eq("role", "recepcao")
    .maybeSingle();

  if (member) {
    const { error } = await admin
      .from("unit_members")
      .update({ is_active: true })
      .eq("id", member.id);
    if (error) return { ok: false, message: "Não foi possível ativar o vínculo." };
  } else {
    const { error } = await admin
      .from("unit_members")
      .insert({ user_id: userId, unit_id: unitId, role: "recepcao" });
    if (error) {
      console.error("[admin] insert unit_members:", error.code);
      return { ok: false, message: "A conta foi criada, mas o vínculo com a unidade falhou." };
    }
  }

  if (!created) {
    return {
      ok: true,
      message: `${email} já tinha conta e agora é recepção desta unidade. Ela entra com a senha atual (a senha informada aqui não foi usada).`,
    };
  }
  return {
    ok: true,
    message: `Conta criada para ${email} com a senha que você definiu. Já pode entrar. Passe a senha à pessoa por um canal seguro.`,
  };
}

/**
 * Define uma nova senha para uma conta de recepção (o administrador escolhe).
 * Também confirma o e-mail, caso a conta tenha vindo de um convite antigo.
 */
export async function setReceptionPassword(input: {
  email: string;
  password: string;
}): Promise<AccessResult> {
  const admin = createAdminClient();
  const { email, password } = input;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, is_active")
    .eq("email", email)
    .maybeSingle();
  if (!profile) return { ok: false, message: "Conta não encontrada." };
  if (!profile.is_active) return { ok: false, message: "Esta conta está inativa." };

  // Esta tela é da recepção: nunca troca a senha de quem também é admin da rede.
  const { count } = await admin
    .from("unit_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("role", "admin_rede");
  if (count) {
    return {
      ok: false,
      message: "Esta conta é de administrador da rede e não pode ser alterada aqui.",
    };
  }

  const { error } = await admin.auth.admin.updateUserById(profile.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("[admin] updateUserById(password):", error.status, error.code);
    return { ok: false, message: "Não foi possível alterar a senha." };
  }
  return {
    ok: true,
    message: "Senha alterada. Passe a nova senha à pessoa por um canal seguro.",
  };
}

"use server";

import { redirect } from "next/navigation";
import { getPublicEnv } from "@/lib/env";
import { formatRetry, rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  toFieldErrors,
  type FormState,
} from "@/lib/validation/auth";

const GENERIC_LOGIN_ERROR = "E-mail ou senha incorretos.";
const TEN_MIN = 10 * 60_000;
const ONE_HOUR = 60 * 60_000;

/** Login com e-mail e senha. Mensagens genéricas: nunca revelam se o e-mail existe. */
export async function signInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Confira os campos e tente novamente.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  const { email, password } = parsed.data;

  // Limite de tentativas: por e-mail+IP (força bruta) e por IP (varredura).
  const ip = await getClientIp();
  const perAccountKey = `login:${ip}:${email}`;
  const byAccount = rateLimit(perAccountKey, 5, TEN_MIN);
  const byIp = rateLimit(`login-ip:${ip}`, 30, TEN_MIN);
  if (!byAccount.ok || !byIp.ok) {
    const secs = Math.max(
      byAccount.ok ? 0 : byAccount.retryAfterSeconds,
      byIp.ok ? 0 : byIp.retryAfterSeconds,
    );
    return {
      status: "error",
      message: `Muitas tentativas. Tente novamente em ${formatRetry(secs)}.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Limite do próprio Supabase (429) vira aviso de espera; o resto é genérico.
    if (error.status === 429) {
      return {
        status: "error",
        message: "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      };
    }
    return { status: "error", message: GENERIC_LOGIN_ERROR };
  }

  resetRateLimit(perAccountKey);
  redirect(safeNext(formData.get("next")));
}

/** Pedido de recuperação de senha. Resposta SEMPRE igual, exista ou não o e-mail. */
export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Informe um e-mail válido.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }
  const { email } = parsed.data;

  const ip = await getClientIp();
  const byAccount = rateLimit(`reset:${ip}:${email}`, 3, ONE_HOUR);
  const byIp = rateLimit(`reset-ip:${ip}`, 10, ONE_HOUR);
  if (!byAccount.ok || !byIp.ok) {
    const secs = Math.max(
      byAccount.ok ? 0 : byAccount.retryAfterSeconds,
      byIp.ok ? 0 : byIp.retryAfterSeconds,
    );
    return {
      status: "error",
      message: `Muitos pedidos. Tente novamente em ${formatRetry(secs)}.`,
    };
  }

  const supabase = await createClient();
  const appUrl = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/redefinir-senha`,
  });
  if (error) {
    // Não revelamos o motivo ao usuário; registramos no servidor.
    console.error("[auth] resetPasswordForEmail:", error.status, error.code);
  }

  return {
    status: "success",
    message:
      "Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. Verifique também o spam.",
  };
}

/** Define/redefine a senha do usuário com sessão de recuperação ou convite. */
export async function updatePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Confira os campos e tente novamente.",
      fieldErrors: toFieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return {
      status: "error",
      message: "Link inválido ou expirado. Solicite um novo link de acesso.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    console.error("[auth] updateUser:", error.status, error.code);
    return {
      status: "error",
      message:
        "Não foi possível definir esta senha. Tente outra ou solicite um novo link.",
    };
  }

  // Encerra a sessão de recuperação: o usuário entra de verdade com a nova senha.
  await supabase.auth.signOut();
  redirect("/login?aviso=senha-definida");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

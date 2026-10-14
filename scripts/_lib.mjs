// Utilitários compartilhados pelos scripts de desenvolvimento (Node, ESM).
// Rode sempre via npm scripts (eles carregam o .env.local com --env-file).
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Variável ${name} ausente no .env.local.`);
    process.exit(1);
  }
  return v;
}

export function adminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function anonClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Senha forte aleatória (atende a política de senha forte). */
export function randomPassword() {
  return `Dg!${randomBytes(9).toString("base64url")}9a`;
}

/** Procura um usuário do Auth pelo e-mail (percorrendo as páginas). */
export async function findUserByEmail(admin, email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Cria (ou atualiza a senha de) um usuário já confirmado. */
export async function upsertUser(admin, { email, password, fullName }) {
  const existing = await findUserByEmail(admin, email);
  if (existing) {
    if (password) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (error) throw error;
    }
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (error) throw error;
  return data.user;
}

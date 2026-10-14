import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getPublicEnv } from "@/lib/env";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Atua COM a sessão do usuário (cookies) — portanto a RLS é aplicada.
 */
export async function createClient() {
  const env = getPublicEnv();
  // Sessão é sempre por requisição. Sem isto, o Next tenta pré-renderizar e
  // reclama do Date.now() usado pelo Supabase para validar a expiração do token.
  await connection();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Chamado de um Server Component (somente leitura de cookies).
            // Ignorar é seguro: o proxy.ts já renova a sessão.
          }
        },
      },
    },
  );
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readPublicEnv } from "@/lib/env";

/**
 * Renova a sessão do Supabase (cookies) a cada requisição e devolve
 * { response, user }. As regras de acesso por papel entram na Etapa 4.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const r = readPublicEnv();
  if (!r.ok) return { response, user: null }; // sem chaves ainda: não quebra

  const supabase = createServerClient(
    r.env.NEXT_PUBLIC_SUPABASE_URL,
    r.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() valida o token no servidor do Supabase (não confie em getSession()).
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }
  return { response, user };
}

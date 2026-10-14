import { readPublicEnv } from "@/lib/env";

export type SupabaseStatus =
  | { state: "not_configured"; issues: string[] }
  | { state: "unreachable"; message: string }
  | { state: "invalid_key"; message: string }
  | { state: "connected"; latencyMs: number };

/**
 * Testa a conexão com o Supabase chamando o endpoint público de saúde do Auth.
 * Valida, ao mesmo tempo, a URL e a anon key. Não expõe segredos.
 */
export async function checkSupabase(): Promise<SupabaseStatus> {
  const r = readPublicEnv();
  if (!r.ok) return { state: "not_configured", issues: r.issues };

  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } =
    r.env;
  const started = Date.now();
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) {
      return {
        state: "invalid_key",
        message: "O Supabase respondeu, mas a anon key foi recusada.",
      };
    }
    if (!res.ok) {
      return {
        state: "unreachable",
        message: `O Supabase respondeu com status ${res.status}.`,
      };
    }
    return { state: "connected", latencyMs: Date.now() - started };
  } catch {
    return {
      state: "unreachable",
      message: "Não foi possível alcançar a URL do Supabase. Confira a Project URL.",
    };
  }
}

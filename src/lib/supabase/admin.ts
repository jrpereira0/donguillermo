import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

/**
 * Cliente com a service_role: IGNORA a RLS. Uso restrito ao servidor e a
 * operações administrativas (ex.: convidar usuários na Etapa 5).
 * Nunca importe em Client Components — `server-only` quebra o build se isso ocorrer.
 */
export function createAdminClient() {
  const url = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não definida no .env.local (necessária só para operações de administrador).",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

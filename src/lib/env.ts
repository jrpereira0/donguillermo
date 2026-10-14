import { z } from "zod";

/**
 * Variáveis PÚBLICAS (vão para o navegador). Devem ser lidas literalmente
 * como process.env.NEXT_PUBLIC_* para o Next substituí-las no build.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL deve ser uma URL válida (https://xxxx.supabase.co)"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, "NEXT_PUBLIC_SUPABASE_ANON_KEY não preenchida"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export type PublicEnv = z.infer<typeof publicSchema>;

/** Retorna as variáveis públicas validadas, ou null se faltar/estiver inválida. */
export function readPublicEnv():
  | { ok: true; env: PublicEnv }
  | { ok: false; issues: string[] } {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  });
  if (parsed.success) return { ok: true, env: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

/** Versão que lança erro — use onde a configuração é obrigatória. */
export function getPublicEnv(): PublicEnv {
  const r = readPublicEnv();
  if (!r.ok) {
    throw new Error(
      `Configuração do Supabase incompleta. Preencha o .env.local:\n- ${r.issues.join("\n- ")}`,
    );
  }
  return r.env;
}

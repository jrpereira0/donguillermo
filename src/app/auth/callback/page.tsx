"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-redirect";

/**
 * Finaliza links enviados por e-mail (recuperação de senha e convite).
 * Roda no navegador porque o link pode trazer os dados no #fragmento da URL,
 * que o servidor nunca recebe. Aceita os 3 formatos do Supabase:
 *   - ?code=...                         (PKCE)
 *   - ?token_hash=...&type=...          (template personalizado)
 *   - #access_token=...&refresh_token=  (convite/links gerados no servidor)
 * Em qualquer falha, volta ao /login com uma mensagem genérica.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // Strict Mode roda efeitos 2x; o código só vale 1 vez.
    ran.current = true;

    async function finish() {
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const next = safeNext(query.get("next"), "/redefinir-senha");
      const supabase = createClient();

      // Apaga tokens da barra de endereço/histórico antes de qualquer coisa.
      window.history.replaceState(null, "", url.pathname);

      if (query.get("error") || hash.get("error")) return fail();

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = query.get("code");
      const tokenHash = query.get("token_hash");
      const type = query.get("type");

      let error: unknown = new Error("sem credenciais no link");
      if (accessToken && refreshToken) {
        ({ error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }));
      } else if (code) {
        ({ error } = await supabase.auth.exchangeCodeForSession(code));
      } else if (tokenHash && type) {
        ({ error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        }));
      }

      if (error) return fail();
      router.replace(next);
    }

    function fail() {
      router.replace("/login?erro=link");
    }

    void finish();
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <p className="label-caps" role="status">
        Validando link…
      </p>
    </main>
  );
}

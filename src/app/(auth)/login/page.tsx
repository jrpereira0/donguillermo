import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Entrar" };

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  // Quem já está logado não precisa ver o login.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/");

  const aviso = first(params.aviso);
  const erro = first(params.erro);
  const rawNext = first(params.next);
  const next = rawNext ? safeNext(rawNext, "") || undefined : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Entrar</h1>
        <p className="text-sm text-muted-foreground">
          Acesse com o e-mail e a senha da sua conta.
        </p>
      </div>

      {aviso === "senha-definida" ? (
        <FormAlert tone="success">
          Senha definida com sucesso. Entre com a nova senha.
        </FormAlert>
      ) : null}
      {aviso === "saiu" ? (
        <FormAlert tone="info">Você saiu da sua conta.</FormAlert>
      ) : null}
      {erro === "link" ? (
        <FormAlert tone="error">
          O link é inválido ou expirou. Solicite um novo em “Esqueci minha senha”.
        </FormAlert>
      ) : null}

      <LoginForm next={next} />
    </div>
  );
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

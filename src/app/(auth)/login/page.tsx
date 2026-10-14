import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
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
    <div className="flex flex-col gap-[clamp(0.75rem,2.2vh,1.5rem)]">
      <AuthHeading
        eyebrow="Área restrita"
        title="Bem-vindo"
        description="Acesse com o e-mail e a senha da sua conta."
      />

      {aviso === "senha-definida" ? (
        <FormAlert tone="success" title="Senha definida com sucesso">
          Entre com a nova senha.
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
    <Suspense
      fallback={
        <div aria-busy="true" className="flex flex-col gap-4">
          <div className="skeleton-luxe h-8 w-1/2 self-center" />
          <div className="skeleton-luxe h-12" />
          <div className="skeleton-luxe h-12" />
          <div className="skeleton-luxe h-12" />
        </div>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

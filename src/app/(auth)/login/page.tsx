import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { LoginForm } from "@/components/auth/login-form";
import { OrnamentDivider } from "@/components/brand/ornament-divider";
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
      <div className="reveal flex flex-col items-center gap-2 text-center" style={{ "--d": "450ms" } as React.CSSProperties}>
        <p className="label-caps text-gold">Área restrita</p>
        <h1 className="bg-gradient-to-b from-cream from-40% to-[#d6bb83] bg-clip-text text-[clamp(1.75rem,4.6vh,2.25rem)] leading-tight text-transparent">
          Bem-vindo
        </h1>
        <OrnamentDivider className="w-40" />
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

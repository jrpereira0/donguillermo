import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { NewPasswordForm } from "@/components/auth/new-password-form";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Definir senha" };

async function NewPasswordContent() {
  // Só chega aqui com sessão de recuperação/convite criada em /auth/callback.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl">Link inválido</h1>
        <FormAlert tone="error">
          Este link é inválido ou expirou. Solicite um novo para continuar.
        </FormAlert>
        <Link href="/esqueci-senha" className={buttonVariants({ size: "lg" })}>
          Solicitar novo link
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Definir senha</h1>
        <p className="text-sm text-muted-foreground">
          Crie a senha de acesso da conta <strong className="text-cream">{data.user.email}</strong>.
        </p>
      </div>
      <NewPasswordForm />
    </div>
  );
}

export default function NewPasswordPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <NewPasswordContent />
    </Suspense>
  );
}

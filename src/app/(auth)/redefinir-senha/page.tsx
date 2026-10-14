import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
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
      <div className="flex flex-col gap-[clamp(0.75rem,2.2vh,1.5rem)]">
        <AuthHeading eyebrow="Link expirado" title="Link inválido" />
        <FormAlert tone="error">
          Este link é inválido ou expirou. Solicite um novo para continuar.
        </FormAlert>
        <Link href="/esqueci-senha" className={buttonVariants({ variant: "luxe", size: "lg" })}>
          Solicitar novo link
          <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[clamp(0.75rem,2.2vh,1.5rem)]">
      <AuthHeading
        eyebrow="Primeiro acesso"
        title="Definir senha"
        description={
          <>
            Crie a senha de acesso da conta{" "}
            <strong className="break-all text-cream">{data.user.email}</strong>.
          </>
        }
      />
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

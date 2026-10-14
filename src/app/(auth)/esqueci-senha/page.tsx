import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-heading";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-[clamp(0.75rem,2.2vh,1.5rem)]">
      <AuthHeading
        eyebrow="Recuperar acesso"
        title="Esqueci a senha"
        description="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
      />
      <ForgotPasswordForm />
    </div>
  );
}

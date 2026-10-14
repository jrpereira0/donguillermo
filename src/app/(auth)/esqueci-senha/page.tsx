import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Esqueci minha senha</h1>
        <p className="text-sm text-muted-foreground">
          Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}

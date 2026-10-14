"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormAlert } from "./form-alert";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialFormState,
  );
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.status === "success" ? (
        <FormAlert tone="success">{state.message}</FormAlert>
      ) : null}
      {state.status === "error" && state.message ? (
        <FormAlert tone="error">{state.message}</FormAlert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="voce@exemplo.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!state.fieldErrors?.email}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
        />
        <FieldError id="email-error" message={state.fieldErrors?.email} />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? "Enviando…" : "Enviar link"}
      </Button>

      <Link
        href="/login"
        className="label-caps self-center py-1 transition-colors hover:text-gold"
      >
        Voltar ao login
      </Link>
    </form>
  );
}

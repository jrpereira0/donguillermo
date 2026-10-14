"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { signInAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormAlert } from "./form-alert";
import { PasswordInput } from "./password-input";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialFormState);
  // Controlado: o React 19 limpa campos não controlados após a action.
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.status === "error" && state.message ? (
        <FormAlert tone="error">{state.message}</FormAlert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Senha</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="Sua senha"
          required
          aria-invalid={!!state.fieldErrors?.password}
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
        />
        <FieldError id="password-error" message={state.fieldErrors?.password} />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? "Entrando…" : "Entrar"}
      </Button>

      <Link
        href="/esqueci-senha"
        className="label-caps self-center py-1 transition-colors hover:text-gold"
      >
        Esqueci minha senha
      </Link>
    </form>
  );
}

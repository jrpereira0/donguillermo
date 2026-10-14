"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormAlert } from "./form-alert";

/** Atraso de entrada (ms) de cada bloco do formulário. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordResetAction,
    initialFormState,
  );
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-[clamp(0.75rem,2.2vh,1.25rem)]" noValidate>
      {state.status === "success" ? (
        <FormAlert tone="success">{state.message}</FormAlert>
      ) : null}
      {state.status === "error" && state.message ? (
        <FormAlert key={state.message} tone="error">
          {state.message}
        </FormAlert>
      ) : null}

      <div className="reveal flex flex-col gap-2" style={delay(650)}>
        <Label htmlFor="email">E-mail</Label>
        <div className="group relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
            <Mail className="size-4" />
          </span>
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
            className="field-luxe pl-11"
          />
        </div>
        <FieldError id="email-error" message={state.fieldErrors?.email} />
      </div>

      <div className="reveal" style={delay(760)}>
        <Button type="submit" variant="luxe" size="lg" disabled={pending} className="w-full">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Enviando…" : "Enviar link"}
          {pending ? null : (
            <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
          )}
        </Button>
      </div>

      <Link
        href="/login"
        className="label-caps link-luxe reveal self-center py-1"
        style={delay(860)}
      >
        Voltar ao login
      </Link>
    </form>
  );
}

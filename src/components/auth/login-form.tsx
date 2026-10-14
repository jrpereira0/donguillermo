"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Loader2, LockKeyhole, Mail } from "lucide-react";
import { signInAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FormAlert } from "./form-alert";
import { PasswordInput } from "./password-input";

/** Atraso de entrada (ms) de cada bloco do formulário. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

const ICON = "size-4";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialFormState);
  // Controlado: o React 19 limpa campos não controlados após a action.
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-[clamp(0.75rem,2.2vh,1.25rem)]" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.status === "error" && state.message ? (
        // `key` reinicia a animação a cada nova tentativa com erro.
        <FormAlert key={state.message} tone="error">
          {state.message}
        </FormAlert>
      ) : null}

      <div className="reveal flex flex-col gap-2" style={delay(650)}>
        <Label htmlFor="email">E-mail</Label>
        <div className="group relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
            <Mail className={ICON} />
          </span>
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
            className="field-luxe pl-11"
          />
        </div>
        <FieldError id="email-error" message={state.fieldErrors?.email} />
      </div>

      <div className="reveal flex flex-col gap-2" style={delay(760)}>
        <Label htmlFor="password">Senha</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="Sua senha"
          required
          leadingIcon={<LockKeyhole className={ICON} />}
          aria-invalid={!!state.fieldErrors?.password}
          aria-describedby={state.fieldErrors?.password ? "password-error" : undefined}
          className="field-luxe"
        />
        <FieldError id="password-error" message={state.fieldErrors?.password} />
      </div>

      <div className="reveal" style={delay(880)}>
        <Button
          type="submit"
          variant="luxe"
          size="lg"
          disabled={pending}
          className="w-full"
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Entrando…" : "Entrar"}
          {pending ? null : (
            <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
          )}
        </Button>
      </div>

      <Link
        href="/esqueci-senha"
        className="label-caps link-luxe reveal self-center py-1"
        style={delay(980)}
      >
        Esqueci minha senha
      </Link>
    </form>
  );
}

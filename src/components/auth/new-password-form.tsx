"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import { updatePasswordAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FieldError, FormAlert } from "./form-alert";
import { PasswordInput } from "./password-input";

/** Atraso de entrada (ms) de cada bloco do formulário. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export function NewPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialFormState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-[clamp(0.75rem,2.2vh,1.25rem)]" noValidate>
      {state.status === "error" && state.message ? (
        <FormAlert key={state.message} tone="error">
          {state.message}
        </FormAlert>
      ) : null}

      <div className="reveal flex flex-col gap-2" style={delay(650)}>
        <Label htmlFor="password">Nova senha</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          leadingIcon={<LockKeyhole className="size-4" />}
          aria-invalid={!!state.fieldErrors?.password}
          aria-describedby="password-help password-error"
          className="field-luxe"
        />
        <p id="password-help" className="text-xs text-muted-foreground">
          Mínimo de 10 caracteres, com maiúscula, minúscula, número e símbolo.
        </p>
        <FieldError id="password-error" message={state.fieldErrors?.password} />
      </div>

      <div className="reveal flex flex-col gap-2" style={delay(760)}>
        <Label htmlFor="confirm">Confirmar senha</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          leadingIcon={<LockKeyhole className="size-4" />}
          aria-invalid={!!state.fieldErrors?.confirm}
          aria-describedby={state.fieldErrors?.confirm ? "confirm-error" : undefined}
          className="field-luxe"
        />
        <FieldError id="confirm-error" message={state.fieldErrors?.confirm} />
      </div>

      <div className="reveal" style={delay(880)}>
        <Button type="submit" variant="luxe" size="lg" disabled={pending} className="w-full">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Salvando…" : "Salvar senha"}
          {pending ? null : (
            <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
          )}
        </Button>
      </div>
    </form>
  );
}

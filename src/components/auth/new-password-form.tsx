"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { updatePasswordAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FieldError, FormAlert } from "./form-alert";
import { PasswordInput } from "./password-input";

export function NewPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updatePasswordAction,
    initialFormState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {state.status === "error" && state.message ? (
        <FormAlert tone="error">{state.message}</FormAlert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Nova senha</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          aria-invalid={!!state.fieldErrors?.password}
          aria-describedby="password-help password-error"
        />
        <p id="password-help" className="text-xs text-muted-foreground">
          Mínimo de 10 caracteres, com maiúscula, minúscula, número e símbolo.
        </p>
        <FieldError id="password-error" message={state.fieldErrors?.password} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirmar senha</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          aria-invalid={!!state.fieldErrors?.confirm}
          aria-describedby={state.fieldErrors?.confirm ? "confirm-error" : undefined}
        />
        <FieldError id="confirm-error" message={state.fieldErrors?.confirm} />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? "Salvando…" : "Salvar senha"}
      </Button>
    </form>
  );
}

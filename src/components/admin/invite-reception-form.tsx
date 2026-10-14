"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { FieldError, FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteReceptionAction } from "@/app/admin/actions";
import { initialAdminState } from "@/lib/admin/state";
import { PasswordFields } from "./password-fields";

/** Cria o acesso de uma recepção (e-mail + senha definida pelo administrador). */
export function InviteReceptionForm({ unitId }: { unitId: string }) {
  const [state, formAction, pending] = useActionState(inviteReceptionAction, initialAdminState);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="unitId" value={unitId} />

      {state.status !== "idle" && state.message ? (
        <FormAlert tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </FormAlert>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-email">E-mail</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            inputMode="email"
            required
            placeholder="recepcao@exemplo.com"
            aria-invalid={!!fe.email}
          />
          <FieldError id="invite-email-error" message={fe.email} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-name">Nome (opcional)</Label>
          <Input id="invite-name" name="fullName" autoComplete="off" />
          <FieldError id="invite-name-error" message={fe.fullName} />
        </div>
      </div>

      {/* Após criar com sucesso, o `key` novo limpa as senhas digitadas. */}
      <PasswordFields
        key={state.status === "success" ? state.message : "form"}
        idPrefix="invite"
        errors={fe}
      />

      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {pending ? "Criando…" : "Criar acesso da recepção"}
      </Button>
    </form>
  );
}

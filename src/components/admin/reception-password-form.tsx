"use client";

import { useActionState, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { changeReceptionPasswordAction } from "@/app/admin/actions";
import { initialAdminState } from "@/lib/admin/state";
import { PasswordFields } from "./password-fields";

/** "Alterar senha" de uma recepção: o administrador define a nova senha. */
export function ReceptionPasswordForm({ memberId }: { memberId: string }) {
  const [state, formAction, pending] = useActionState(
    changeReceptionPasswordAction,
    initialAdminState,
  );
  const [open, setOpen] = useState(false);

  // Depois de salvar com sucesso, o painel de senha fecha (a mensagem fica visível).
  const editing = open && state.status !== "success";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="memberId" value={memberId} />

      {editing ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-background/40 p-4">
          <PasswordFields idPrefix={`pw-${memberId}`} errors={state.fieldErrors} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {pending ? "Salvando…" : "Salvar nova senha"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <KeyRound />
            Alterar senha
          </Button>
        </div>
      )}

      {state.status !== "idle" && state.message ? (
        <FormAlert tone={state.status === "success" ? "success" : "error"}>
          {state.message}
        </FormAlert>
      ) : null}
    </form>
  );
}

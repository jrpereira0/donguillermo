"use client";

import { useActionState, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordFields } from "@/components/admin/password-fields";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { changeBarberPasswordAction } from "@/app/u/[slug]/profissionais/actions";
import { initialBarberState } from "@/lib/barbers/types";

/** "Alterar senha" do login do profissional: quem define é a recepção. */
export function BarberPasswordForm({ slug, barberId }: { slug: string; barberId: string }) {
  const [state, formAction, pending] = useActionState(
    changeBarberPasswordAction.bind(null, slug, barberId),
    initialBarberState,
  );
  const [open, setOpen] = useState(false);
  const [closedNotice, setClosedNotice] = useState<unknown>(null);

  // Depois de salvar, o painel fecha e a mensagem fica visível.
  const editing = open && state.status !== "success";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {editing ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-black/20 p-4">
          <PasswordFields idPrefix={`pw-${barberId}`} errors={state.fieldErrors} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="luxe" size="sm" disabled={pending}>
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

      {state.status === "success" && closedNotice !== state ? (
        <Notice title="Senha alterada" onClose={() => setClosedNotice(state)}>
          O profissional já pode entrar com a nova senha.
        </Notice>
      ) : null}
      {state.status === "error" && state.message ? (
        <FormAlert key={state.message} tone="error">
          {state.message}
        </FormAlert>
      ) : null}
    </form>
  );
}

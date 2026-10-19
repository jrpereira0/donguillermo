"use client";

import { useActionState, useState } from "react";
import { RotateCcw } from "lucide-react";
import { reopenRegisterAction } from "@/app/u/[slug]/caixa/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/validation/auth";

const idle: FormState = { status: "idle" };

export function ReopenRegisterButton({ slug, registerId }: { slug: string; registerId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action, pending] = useActionState(reopenRegisterAction.bind(null, slug, registerId), idle);

  if (!confirm) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Button type="button" variant="outline" onClick={() => setConfirm(true)} className="border-gold/40 text-gold hover:border-gold/70 hover:bg-gold/10 hover:text-gold">
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Reabrir caixa
        </Button>
        {state.status === "error" && state.message ? <FormAlert tone="error">{state.message}</FormAlert> : null}
      </div>
    );
  }

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-gold/35 bg-gold/[0.06] px-4 py-3.5">
      <p className="text-sm font-medium text-cream">Reabrir este caixa?</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        O fechamento é desfeito: comandas, pagamentos e movimentos voltam para este caixa, que passa a ser o caixa
        aberto da unidade. A contagem do fechamento é apagada.
      </p>
      {state.status === "error" && state.message ? <FormAlert tone="error">{state.message}</FormAlert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="luxe" size="sm" disabled={pending}>
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {pending ? "Reabrindo…" : "Sim, reabrir"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirm(false)} disabled={pending}>
          Manter fechado
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { sellPackageAction } from "@/app/u/[slug]/pacotes/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { FormState } from "@/lib/validation/auth";

const idle: FormState = { status: "idle" };

export function SellPackageForm({
  slug,
  customerId,
  options,
}: {
  slug: string;
  customerId: string;
  options: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(sellPackageAction.bind(null, slug, customerId), idle);
  const [packageId, setPackageId] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.status === "error" && state.message ? <FormAlert tone="error">{state.message}</FormAlert> : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Select
            name="packageId"
            value={packageId}
            onValueChange={setPackageId}
            options={options}
            placeholder="Escolha o pacote"
            searchable
            searchPlaceholder="Buscar pacote"
            disabled={!options.length}
          />
        </div>
        <Button type="submit" variant="luxe" size="lg" className="shrink-0" disabled={pending || !packageId}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {pending ? "Abrindo…" : "Vender e cobrar"}
          {pending ? null : <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />}
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Abre a comanda da venda com o valor do pacote. O pacote só fica <strong className="font-medium text-cream">ativo</strong>{" "}
        depois que essa comanda for cobrada no caixa.
      </p>
    </form>
  );
}

"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { cancelCustomerPackageAction } from "@/app/u/[slug]/pacotes/actions";
import { Button } from "@/components/ui/button";

export function CancelPackageButton({ slug, customerPackageId }: { slug: string; customerPackageId: string }) {
  const [confirm, setConfirm] = useState(false);
  if (!confirm) {
    return (
      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-rose-300" onClick={() => setConfirm(true)}>
        <Ban />
        Cancelar pacote
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-amber-200">Cancelar este pacote? O estorno do valor é feito à parte, no caixa.</span>
      <form action={cancelCustomerPackageAction.bind(null, slug, customerPackageId)}>
        <Button type="submit" variant="destructive" size="sm">
          Sim, cancelar
        </Button>
      </form>
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirm(false)}>
        Voltar
      </Button>
    </span>
  );
}

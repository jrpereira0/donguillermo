"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { saveNetworkProductsPctAction } from "@/app/admin/comissoes/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const field =
  "field-luxe h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-sm text-cream tabular-nums outline-none";

/** % de produtos da rede: vale para todo profissional sem % próprio. */
export function NetworkProductsForm({ initialPct }: { initialPct: number }) {
  const [pct, setPct] = useState(() => String(initialPct).replace(".", ","));
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const value = Number(pct.replace(/\./g, "").replace(",", "."));
    startTransition(async () => {
      const res = await saveNetworkProductsPctAction(value);
      setResult(
        res.ok
          ? { ok: true, message: "Percentual salvo. As comissões de produtos já usam o novo valor." }
          : { ok: false, message: res.message },
      );
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {result ? (
        <FormAlert tone={result.ok ? "success" : "error"} onClose={() => setResult(null)}>
          {result.message}
        </FormAlert>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-44 flex-col gap-1.5">
          <span className="label-caps text-[0.65rem]">Produtos (%)</span>
          <span className="relative block">
            <input
              value={pct}
              onChange={(e) => {
                setResult(null);
                setPct(e.target.value.replace(/[^\d,]/g, "").slice(0, 5));
              }}
              inputMode="decimal"
              aria-label="Percentual de comissão de produtos da rede"
              placeholder="10"
              className={cn(field, "pr-8")}
            />
            <span className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center text-sm text-muted-foreground">
              %
            </span>
          </span>
        </label>
        <Button type="button" variant="luxe" size="lg" onClick={save} disabled={pending}>
          <Save className="size-4" aria-hidden="true" />
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Vale para todos os profissionais. Quem tiver percentual próprio (abaixo) fica fora desta regra.
      </p>
    </div>
  );
}

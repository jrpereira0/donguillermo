"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { saveBarberOverridesAction, type BarberOverrideInput } from "@/app/admin/comissoes/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { BarberCommissionAdminRow } from "@/lib/commissions/admin";
import { cn } from "@/lib/utils";

type Row = { id: string; name: string; unitName: string; isActive: boolean; services: string; products: string };

const toRow = (b: BarberCommissionAdminRow): Row => ({
  id: b.id,
  name: b.name,
  unitName: b.unitName,
  isActive: b.isActive,
  services: b.servicesPct === null ? "" : String(b.servicesPct).replace(".", ","),
  products: b.productsPct === null ? "" : String(b.productsPct).replace(".", ","),
});

const field =
  "field-luxe h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-sm text-cream tabular-nums outline-none";

/** % próprio por profissional: campo vazio = segue a regra da rede. */
export function BarberOverridesForm({ initial }: { initial: BarberCommissionAdminRow[] }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map(toRow));
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (i: number, part: Partial<Row>) => {
    setResult(null);
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...part } : r)));
  };

  const save = () => {
    const parsed: BarberOverrideInput[] = rows.map((r) => ({
      barberId: r.id,
      servicesPct: r.services.trim() === "" ? null : Number(r.services.replace(/\./g, "").replace(",", ".")),
      productsPct: r.products.trim() === "" ? null : Number(r.products.replace(/\./g, "").replace(",", ".")),
    }));
    startTransition(async () => {
      const res = await saveBarberOverridesAction(parsed);
      setResult(
        res.ok
          ? { ok: true, message: "Percentuais salvos. As comissões já usam os novos valores." }
          : { ok: false, message: res.message },
      );
    });
  };

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado ainda.</p>;
  }

  const pctInput = (value: string, onChange: (v: string) => void, label: string) => (
    <span className="relative block">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,]/g, "").slice(0, 5))}
        inputMode="decimal"
        aria-label={label}
        placeholder="Rede"
        className={cn(field, "pr-7")}
      />
      <span className="pointer-events-none absolute inset-y-0 right-0 flex w-7 items-center justify-center text-sm text-muted-foreground">
        %
      </span>
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      {result ? (
        <FormAlert tone={result.ok ? "success" : "error"} onClose={() => setResult(null)}>
          {result.message}
        </FormAlert>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[minmax(0,1.6fr)_8.5rem_8.5rem] gap-2 border-b border-border bg-black/25 px-3 py-2.5 sm:gap-3 sm:px-4">
          {["Profissional", "Serviços (%)", "Produtos (%)"].map((h) => (
            <span key={h} className="label-caps text-[0.6rem]">
              {h}
            </span>
          ))}
        </div>
        <ul className="divide-y divide-border/70">
          {rows.map((r, i) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,1.6fr)_8.5rem_8.5rem] items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-cream">
                  {r.name}
                  {r.isActive ? null : <span className="text-muted-foreground"> · inativo</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{r.unitName}</span>
              </span>
              {pctInput(r.services, (v) => patch(i, { services: v }), `Percentual próprio de serviços de ${r.name}`)}
              {pctInput(r.products, (v) => patch(i, { products: v }), `Percentual próprio de produtos de ${r.name}`)}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Campo vazio segue a rede: serviços pela tabela acima, produtos pelo percentual da rede. Preenchido, vale o
        percentual daquele profissional.
      </p>

      <div>
        <Button type="button" variant="luxe" size="lg" onClick={save} disabled={pending}>
          <Save className="size-4" aria-hidden="true" />
          {pending ? "Salvando…" : "Salvar percentuais"}
        </Button>
      </div>
    </div>
  );
}

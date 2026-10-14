"use client";

import Link from "next/link";
import { Check, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { AssignableBarber } from "@/lib/services/types";
import { cn } from "@/lib/utils";
import { BarberAvatar } from "./barber-avatar";
import { DEFAULT_MINUTES_VALUE, durationOptions } from "./duration-options";

/** Profissional marcado -> duração própria em minutos ("" = usa a padrão do serviço). */
export type BarberMinutes = Record<string, string>;

type Props = {
  slug: string;
  barbers: AssignableBarber[];
  selected: BarberMinutes;
  /** Duração padrão do serviço (a que vale quando o profissional não tem a sua). */
  defaultMinutes: number;
  onChange: (next: BarberMinutes) => void;
};

/**
 * Escolha de quem realiza o serviço: um cartão por profissional ativo, com foto, nome e
 * função. Tocar no cartão marca/desmarca; o profissional marcado ganha a opção de uma
 * duração própria (ex.: um barbeiro mais lento ou mais rápido que o padrão).
 */
export function ServiceBarberPicker({ slug, barbers, selected, defaultMinutes, onChange }: Props) {
  const count = Object.keys(selected).length;
  const allOn = barbers.length > 0 && barbers.every((b) => b.id in selected);

  const toggle = (id: string) => {
    if (id in selected) {
      const next = { ...selected };
      delete next[id];
      onChange(next);
    } else {
      onChange({ ...selected, [id]: "" });
    }
  };

  const options = durationOptions(defaultMinutes);

  if (barbers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-[#0b0b0b]/40 px-6 py-10 text-center">
        <Users className="size-7 text-gold" aria-hidden="true" />
        <p className="font-heading text-base uppercase tracking-wide">Nenhum profissional ativo</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Cadastre os profissionais da unidade para escolher quem realiza este serviço.
        </p>
        <Link href={`/u/${slug}/profissionais/novo`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Cadastrar profissional
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-heading text-base font-semibold text-foreground">{count}</span> de {barbers.length}{" "}
          {barbers.length === 1 ? "profissional" : "profissionais"}
        </p>
        <button
          type="button"
          onClick={() => onChange(allOn ? {} : Object.fromEntries(barbers.map((b) => [b.id, selected[b.id] ?? ""])))}
          className="label-caps cursor-pointer rounded-md border border-border px-3 py-2 text-[0.65rem] transition-colors hover:border-gold/50 hover:text-gold"
        >
          {allOn ? "Desmarcar todos" : "Marcar todos"}
        </button>
      </div>

      <ul className="grid items-start gap-3 sm:grid-cols-2" role="group" aria-label="Profissionais que realizam o serviço">
        {barbers.map((b) => {
          const on = b.id in selected;
          const minutes = selected[b.id] ?? "";
          return (
            <li
              key={b.id}
              className={cn(
                "overflow-hidden rounded-xl border transition-colors",
                on ? "border-gold/60 bg-gold/[0.07]" : "border-border bg-[#0b0b0b]/40 hover:border-gold/30 hover:bg-white/[0.03]",
              )}
            >
              <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(b.id)} />
                <BarberAvatar name={b.name} url={b.photoUrl} className="size-11 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-base font-semibold uppercase tracking-wide">{b.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">{b.role}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors",
                    on ? "border-gold bg-gold text-[#101010]" : "border-border text-transparent",
                  )}
                >
                  <Check className="size-4" strokeWidth={3} />
                </span>
              </label>

              {on ? (
                <div className="flex items-center gap-3 border-t border-gold/20 bg-black/20 px-3.5 py-2.5">
                  <span className="label-caps shrink-0 text-[0.65rem]">Duração</span>
                  <Select
                    id={`barber-minutes-${b.id}`}
                    value={minutes || DEFAULT_MINUTES_VALUE}
                    onValueChange={(v) => onChange({ ...selected, [b.id]: v === DEFAULT_MINUTES_VALUE ? "" : v })}
                    options={options}
                    className="h-9"
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Por padrão todos fazem o serviço no tempo definido em Preço e duração. Escolha outra duração para quem leva mais ou
        menos tempo.
      </p>
    </div>
  );
}

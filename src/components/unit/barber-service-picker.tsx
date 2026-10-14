"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Clock, Scissors, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { AssignableService } from "@/lib/services/types";
import { formatDuration } from "@/lib/validation/service";
import { cn } from "@/lib/utils";
import { DEFAULT_MINUTES_VALUE, durationOptions } from "./duration-options";
import { ServiceThumb } from "./service-icon";

/** Serviço marcado -> duração própria em minutos ("" = usa a padrão do serviço). */
export type ServiceMinutes = Record<string, string>;

type Props = {
  slug: string;
  services: AssignableService[];
  selected: ServiceMinutes;
  onChange: (next: ServiceMinutes) => void;
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Escolha dos serviços que o profissional realiza: um cartão por serviço ativo (imagem ou
 * ícone, nome, categoria e duração padrão). Tocar marca/desmarca; o serviço marcado ganha a
 * opção de uma duração própria para este profissional.
 */
export function BarberServicePicker({ slug, services, selected, onChange }: Props) {
  const [query, setQuery] = useState("");
  const count = Object.keys(selected).length;
  const allOn = services.length > 0 && services.every((s) => s.id in selected);

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return services;
    return services.filter((s) => normalize(`${s.name} ${s.categoryLabel}`).includes(q));
  }, [services, query]);

  const toggle = (id: string) => {
    if (id in selected) {
      const next = { ...selected };
      delete next[id];
      onChange(next);
    } else {
      onChange({ ...selected, [id]: "" });
    }
  };

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-[#0b0b0b]/40 px-6 py-10 text-center">
        <Scissors className="size-7 text-gold" aria-hidden="true" />
        <p className="font-heading text-base uppercase tracking-wide">Nenhum serviço ativo</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Cadastre os serviços da unidade para escolher o que este profissional realiza.
        </p>
        <Link href={`/u/${slug}/servicos/novo`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Cadastrar serviço
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-heading text-base font-semibold text-foreground">{count}</span> de {services.length}{" "}
          {services.length === 1 ? "serviço" : "serviços"}
        </p>
        <button
          type="button"
          onClick={() => onChange(allOn ? {} : Object.fromEntries(services.map((s) => [s.id, selected[s.id] ?? ""])))}
          className="label-caps cursor-pointer rounded-md border border-border px-3 py-2 text-[0.65rem] transition-colors hover:border-gold/50 hover:text-gold"
        >
          {allOn ? "Desmarcar todos" : "Marcar todos"}
        </button>
      </div>

      {services.length > 6 ? (
        <div className="group relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
            <Search className="size-4" aria-hidden="true" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar serviço"
            aria-label="Buscar serviço"
            autoComplete="off"
            className="field-luxe h-11 w-full min-w-0 rounded-lg border border-input pl-11 pr-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum serviço encontrado.</p>
      ) : (
        <ul className="grid items-start gap-3 sm:grid-cols-2" role="group" aria-label="Serviços que o profissional realiza">
          {shown.map((s) => {
            const on = s.id in selected;
            const minutes = selected[s.id] ?? "";
            return (
              <li
                key={s.id}
                className={cn(
                  "overflow-hidden rounded-xl border transition-colors",
                  on ? "border-gold/60 bg-gold/[0.07]" : "border-border bg-[#0b0b0b]/40 hover:border-gold/30 hover:bg-white/[0.03]",
                )}
              >
                <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(s.id)} />
                  <ServiceThumb url={s.imageUrl} category={s.category} className="size-11 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading text-base font-semibold uppercase tracking-wide">{s.name}</span>
                    <span className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      {s.categoryLabel}
                      <span aria-hidden="true">·</span>
                      <Clock className="size-3 shrink-0 text-gold/80" aria-hidden="true" />
                      {formatDuration(s.minutes)}
                    </span>
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
                      id={`service-minutes-${s.id}`}
                      value={minutes || DEFAULT_MINUTES_VALUE}
                      onValueChange={(v) => onChange({ ...selected, [s.id]: v === DEFAULT_MINUTES_VALUE ? "" : v })}
                      options={durationOptions(s.minutes)}
                      className="h-9"
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Cada serviço usa o tempo padrão dele. Escolha outra duração para os serviços que este profissional faz em mais ou
        menos tempo.
      </p>
    </div>
  );
}

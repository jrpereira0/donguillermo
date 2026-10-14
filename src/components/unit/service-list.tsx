"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, Pencil, Power, Search, SearchX } from "lucide-react";
import { toggleServiceActiveAction } from "@/app/u/[slug]/servicos/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarberAvatar } from "./barber-avatar";
import { ServiceThumb } from "./service-icon";

export type ServiceListItem = {
  id: string;
  name: string;
  description: string | null;
  /** Valor da categoria (define o ícone) e o rótulo já traduzido. */
  category: string;
  /** URL pública da imagem (ou null: usa o ícone da categoria). */
  imageUrl: string | null;
  categoryLabel: string;
  /** Profissionais habilitados a fazer o serviço. */
  barbers: { id: string; name: string; photoUrl: string | null }[];
  /** Já formatados: "30 min" e "R$ 45,00". */
  durationLabel: string;
  priceLabel: string;
  active: boolean;
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Colunas em telas largas: Serviço | Categoria | Duração | Preço | Profissionais | Status | Ações
const COLS = "xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_5.5rem_6.5rem_8.5rem_6.5rem_10rem]";

function StatusBadge({ active, className }: { active: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-label text-[0.65rem] uppercase tracking-[0.18em]",
        active ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-success" : "bg-muted-foreground/50")} aria-hidden="true" />
      {active ? "Ativo" : "Inativo"}
    </span>
  );
}

/** Fotos sobrepostas de quem faz o serviço (até 3, com "+N" para o resto). */
function BarberStack({ barbers }: { barbers: ServiceListItem["barbers"] }) {
  if (barbers.length === 0) {
    return <span className="ml-auto text-xs text-muted-foreground/70 xl:ml-0">Sem profissionais</span>;
  }
  const shown = barbers.slice(0, 3);
  const extra = barbers.length - shown.length;
  const names = barbers.map((b) => b.name).join(", ");
  return (
    <span className="ml-auto flex items-center xl:ml-0" title={names} aria-label={`Profissionais: ${names}`}>
      {shown.map((b, i) => (
        <BarberAvatar
          key={b.id}
          name={b.name}
          url={b.photoUrl}
          className={cn("size-8 text-[0.65rem] ring-2 ring-[#1c1c1c]", i > 0 && "-ml-2.5")}
        />
      ))}
      {extra > 0 ? (
        <span className="-ml-2.5 flex size-8 items-center justify-center rounded-full border border-border bg-[#101010] font-label text-[0.65rem] text-muted-foreground ring-2 ring-[#1c1c1c]">
          +{extra}
        </span>
      ) : null}
    </span>
  );
}

/** Botão do grupo de ações: texto pequeno em caixa alta, fundo muda no hover. */
const actionBtn =
  "inline-flex h-10 items-center justify-center gap-2 px-4 font-label text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground outline-none transition-colors xl:h-9";

/**
 * Lista de serviços: busca por nome, categoria ou descrição e uma tabela (telas largas) que
 * vira cartões no celular. A linha inteira abre a edição.
 */
export function ServiceList({ slug, services }: { slug: string; services: ServiceListItem[] }) {
  const [query, setQuery] = useState("");
  const base = `/u/${slug}/servicos`;

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return services;
    return services.filter((s) => normalize([s.name, s.categoryLabel, s.description ?? ""].join(" ")).includes(q));
  }, [services, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="group relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
          <Search className="size-4" aria-hidden="true" />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, categoria ou descrição"
          aria-label="Buscar serviço"
          autoComplete="off"
          className="field-luxe h-11 w-full min-w-0 rounded-lg border border-input pl-11 pr-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
        {/* Cabeçalho da tabela (só em telas largas) */}
        <div
          className={cn("label-caps hidden gap-x-5 border-b border-border bg-black/20 px-5 py-3 text-[0.65rem] xl:grid", COLS)}
          aria-hidden="true"
        >
          <span>Serviço</span>
          <span>Categoria</span>
          <span>Duração</span>
          <span>Preço</span>
          <span>Profissionais</span>
          <span>Status</span>
          <span className="text-right">Ações</span>
        </div>

        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <SearchX className="size-7 text-gold" aria-hidden="true" />
            <p className="font-heading text-base uppercase tracking-wide">Nenhum serviço encontrado</p>
            <p className="text-sm text-muted-foreground">Confira o que foi digitado na busca.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setQuery("")}>
              Limpar busca
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((s) => {
              return (
                <li
                  key={s.id}
                  className={cn(
                    "relative grid items-center gap-x-5 gap-y-3 px-4 py-4 transition-colors hover:bg-white/[0.035] focus-within:bg-white/[0.035] sm:px-5",
                    COLS,
                  )}
                >
                  {/* Serviço */}
                  <div className={cn("flex min-w-0 items-center gap-3", !s.active && "opacity-60")}>
                    <ServiceThumb url={s.imageUrl} category={s.category} className="size-14 rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <Link
                          href={`${base}/${s.id}`}
                          className="truncate font-heading text-base font-semibold uppercase leading-tight tracking-wide outline-none transition-colors after:absolute after:inset-0 after:content-[''] hover:text-gold focus-visible:text-gold"
                        >
                          {s.name}
                        </Link>
                        <StatusBadge active={s.active} className="xl:hidden" />
                      </div>
                      {s.description ? (
                        <p className="truncate text-sm text-muted-foreground">{s.description}</p>
                      ) : (
                        <p className="truncate text-sm text-muted-foreground/60 xl:hidden">{s.categoryLabel}</p>
                      )}
                    </div>
                  </div>

                  {/* Categoria (tabela) */}
                  <p className={cn("hidden truncate text-sm text-muted-foreground xl:block", !s.active && "opacity-60")}>
                    {s.categoryLabel}
                  </p>

                  {/* Duração e preço: na tabela, uma coluna cada; no cartão, lado a lado */}
                  <div className={cn("flex items-center gap-4 xl:contents", !s.active && "opacity-60")}>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="size-3.5 shrink-0 text-gold/80" aria-hidden="true" />
                      {s.durationLabel}
                    </span>
                    <span className="font-heading text-base font-semibold tracking-wide text-foreground">{s.priceLabel}</span>
                    <BarberStack barbers={s.barbers} />
                  </div>

                  {/* Status (tabela) */}
                  <div className="hidden xl:block">
                    <StatusBadge active={s.active} />
                  </div>

                  {/* Ações: grupo segmentado (editar | ativar/desativar). Fica acima do link da linha. */}
                  <div className="relative z-10 flex xl:justify-end">
                    <div className="flex w-full divide-x divide-border overflow-hidden rounded-lg border border-border bg-[#0b0b0b]/50 xl:w-auto">
                      <Link
                        href={`${base}/${s.id}`}
                        className={cn(actionBtn, "flex-1 hover:bg-gold/10 hover:text-gold focus-visible:bg-gold/10 focus-visible:text-gold xl:flex-none")}
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Link>
                      <form action={toggleServiceActiveAction.bind(null, slug, s.id, !s.active)} className="flex flex-1 xl:flex-none">
                        <button
                          type="submit"
                          title={s.active ? "Desativar serviço" : "Reativar serviço"}
                          className={cn(
                            actionBtn,
                            "w-full cursor-pointer xl:w-10 xl:px-0",
                            s.active
                              ? "hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
                              : "text-gold hover:bg-gold/10 focus-visible:bg-gold/10",
                          )}
                        >
                          <Power className="size-4" />
                          <span className="xl:sr-only">{s.active ? "Desativar" : "Reativar"}</span>
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {shown.length === services.length
          ? `${services.length} ${services.length === 1 ? "serviço" : "serviços"}`
          : `Mostrando ${shown.length} de ${services.length}`}
      </p>
    </div>
  );
}

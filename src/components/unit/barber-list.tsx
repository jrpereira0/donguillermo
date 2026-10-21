"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Mail, MessageCircle, Pencil, Phone, Power, Search, SearchX } from "lucide-react";
import { toggleBarberActiveAction } from "@/app/u/[slug]/profissionais/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BarberAvatar } from "./barber-avatar";

export type BarberListItem = {
  id: string;
  displayName: string;
  fullName: string;
  /** Função já com rótulo, ex.: "Barbeiro". */
  jobTitle: string;
  photoUrl: string | null;
  /** Já formatado, ex.: (11) 91234-5678. */
  phone: string | null;
  /** Só dígitos (DDD + número), para os links de contato. */
  phoneDigits: string | null;
  email: string | null;
  active: boolean;
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// Colunas em telas largas: Profissional | Contato | Status | Ações
const COLS = "xl:grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_6.5rem_10rem]";

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

/** Botão do grupo de ações: texto pequeno em caixa alta, fundo muda no hover. */
const actionBtn =
  "inline-flex h-10 items-center justify-center gap-2 px-4 font-label text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground outline-none transition-colors xl:h-9";

/** Botão quadrado só com ícone (WhatsApp). */
const contactBtn = buttonVariants({
  variant: "outline",
  size: "icon",
  className: "relative z-10 size-9 sm:size-8",
});

/**
 * Lista de profissionais: busca por nome, apelido, telefone ou e-mail e uma tabela
 * (telas largas) que vira cartões no celular. Celular com botão de WhatsApp ao lado do número.
 */
export function BarberList({ slug, barbers }: { slug: string; barbers: BarberListItem[] }) {
  const [query, setQuery] = useState("");
  /** Profissional com a confirmação de desativar aberta (desativar nunca é num clique só). */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const base = `/u/${slug}/profissionais`;

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return barbers;
    return barbers.filter((b) =>
      normalize([b.displayName, b.fullName, b.jobTitle, b.phone ?? "", b.email ?? ""].join(" ")).includes(q),
    );
  }, [barbers, query]);

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
          placeholder="Buscar por nome, apelido, telefone ou e-mail"
          aria-label="Buscar profissional"
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
          <span>Profissional</span>
          <span>Contato</span>
          <span>Status</span>
          <span className="text-right">Ações</span>
        </div>

        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <SearchX className="size-7 text-gold" aria-hidden="true" />
            <p className="font-heading text-base uppercase tracking-wide">Nenhum profissional encontrado</p>
            <p className="text-sm text-muted-foreground">Confira o que foi digitado na busca.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setQuery("")}>
              Limpar busca
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((b) => {
              const mobile = b.phoneDigits?.length === 11; // só celular tem WhatsApp
              return (
                <li
                  key={b.id}
                  className={cn(
                    "relative grid items-center gap-x-5 gap-y-4 px-4 py-4 transition-colors hover:bg-white/[0.035] focus-within:bg-white/[0.035] sm:px-5",
                    COLS,
                  )}
                >
                  {/* Profissional */}
                  <div className={cn("flex min-w-0 items-center gap-3", !b.active && "opacity-60")}>
                    <BarberAvatar name={b.displayName} url={b.photoUrl} className="size-12 text-base" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <Link
                          href={`${base}/${b.id}`}
                          className="truncate font-heading text-base font-semibold uppercase leading-tight tracking-wide outline-none transition-colors after:absolute after:inset-0 after:content-[''] hover:text-gold focus-visible:text-gold"
                        >
                          {b.displayName}
                        </Link>
                        <StatusBadge active={b.active} className="xl:hidden" />
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        <span className="text-gold/90">{b.jobTitle}</span>
                        <span aria-hidden="true"> · </span>
                        {b.fullName}
                      </p>
                    </div>
                  </div>

                  {/* Contato: telefone com o botão do WhatsApp logo ao lado */}
                  <div className="flex min-w-0 flex-col gap-1.5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2.5">
                      <span className={cn("flex min-w-0 items-center gap-2", !b.active && "opacity-60")}>
                        <Phone className="size-3.5 shrink-0 text-gold/80" aria-hidden="true" />
                        <span className="truncate">{b.phone ?? "Sem telefone"}</span>
                      </span>
                      {mobile ? (
                        <a
                          href={`https://wa.me/55${b.phoneDigits}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={contactBtn}
                          aria-label={`Chamar ${b.displayName} no WhatsApp`}
                          title="Chamar no WhatsApp"
                        >
                          <MessageCircle />
                        </a>
                      ) : null}
                    </div>
                    {b.email ? (
                      <span className={cn("flex items-center gap-2", !b.active && "opacity-60")}>
                        <Mail className="size-3.5 shrink-0 text-gold/80" aria-hidden="true" />
                        <span className="truncate" title={b.email}>
                          {b.email}
                        </span>
                      </span>
                    ) : null}
                  </div>

                  {/* Status (tabela) */}
                  <div className="hidden xl:block">
                    <StatusBadge active={b.active} />
                  </div>

                  {/* Ações: grupo segmentado (editar | ativar/desativar). Fica acima do link da linha. */}
                  <div className="relative z-10 flex xl:justify-end">
                    <div className="flex w-full divide-x divide-border overflow-hidden rounded-lg border border-border bg-[#0b0b0b]/50 xl:w-auto">
                      <Link
                        href={`${base}/${b.id}`}
                        className={cn(actionBtn, "flex-1 hover:bg-gold/10 hover:text-gold focus-visible:bg-gold/10 focus-visible:text-gold xl:flex-none")}
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Link>
                      {b.active ? (
                        <button
                          type="button"
                          title="Desativar profissional"
                          aria-expanded={confirmId === b.id}
                          onClick={() => setConfirmId(confirmId === b.id ? null : b.id)}
                          className={cn(
                            actionBtn,
                            "w-full flex-1 cursor-pointer xl:w-10 xl:flex-none xl:px-0",
                            "hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive",
                          )}
                        >
                          <Power className="size-4" />
                          <span className="xl:sr-only">Desativar</span>
                        </button>
                      ) : (
                        <form action={toggleBarberActiveAction.bind(null, slug, b.id, true)} className="flex flex-1 xl:flex-none">
                          <button
                            type="submit"
                            title="Reativar profissional"
                            className={cn(
                              actionBtn,
                              "w-full cursor-pointer xl:w-10 xl:px-0",
                              "text-gold hover:bg-gold/10 focus-visible:bg-gold/10",
                            )}
                          >
                            <Power className="size-4" />
                            <span className="xl:sr-only">Reativar</span>
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {/* Confirmação de desativar: aparece na própria linha, sem modal. */}
                  {b.active && confirmId === b.id ? (
                    <div
                      role="alertdialog"
                      aria-label={`Desativar ${b.displayName}?`}
                      className="relative z-10 flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/[0.06] px-4 py-3 xl:col-span-4"
                    >
                      <p className="text-sm font-medium text-cream">Desativar {b.displayName}?</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Ele some das listas, da agenda e perde o acesso ao sistema. Os dados e o histórico ficam
                        guardados e dá para reativar depois.
                      </p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <form action={toggleBarberActiveAction.bind(null, slug, b.id, false)}>
                          <Button type="submit" size="sm" className="bg-destructive text-white hover:bg-destructive/85">
                            Sim, desativar
                          </Button>
                        </form>
                        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmId(null)}>
                          Voltar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {shown.length === barbers.length
          ? `${barbers.length} ${barbers.length === 1 ? "profissional" : "profissionais"}`
          : `Mostrando ${shown.length} de ${barbers.length}`}
      </p>
    </div>
  );
}

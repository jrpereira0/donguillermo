import Link from "next/link";
import { Building2, Globe, Pencil, Power, Store } from "lucide-react";
import { toggleCustomerActiveAction } from "@/app/u/[slug]/clientes/actions";
import { cn } from "@/lib/utils";
import { maskPhone } from "@/lib/validation/barber";
import { BarberAvatar } from "./barber-avatar";

export type CustomerListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  /** Nome da unidade onde foi cadastrado (ou null). */
  originUnit: string | null;
  viaSelf: boolean;
  /** Data de cadastro já formatada. */
  createdLabel: string;
  active: boolean;
};

// Colunas em telas largas: Cliente | Contato | Cadastro | Status | Ações
const COLS = "xl:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_6.5rem_10rem]";

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

const actionBtn =
  "inline-flex h-10 items-center justify-center gap-2 px-4 font-label text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground outline-none transition-colors xl:h-9";

/** Lista de clientes da rede (tabela em telas largas, cartões no celular). A linha inteira abre o cadastro. */
export function CustomerList({ slug, customers }: { slug: string; customers: CustomerListItem[] }) {
  const base = `/u/${slug}/clientes`;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
      <div
        className={cn("label-caps hidden gap-x-5 border-b border-border bg-black/20 px-5 py-3 text-[0.65rem] xl:grid", COLS)}
        aria-hidden="true"
      >
        <span>Cliente</span>
        <span>Contato</span>
        <span>Cadastro</span>
        <span>Status</span>
        <span className="text-right">Ações</span>
      </div>

      <ul className="divide-y divide-border">
        {customers.map((c) => (
          <li
            key={c.id}
            className={cn(
              "relative grid items-center gap-x-5 gap-y-3 px-4 py-4 transition-colors hover:bg-white/[0.035] focus-within:bg-white/[0.035] sm:px-5",
              COLS,
            )}
          >
            <div className={cn("flex min-w-0 items-center gap-3", !c.active && "opacity-60")}>
              <BarberAvatar name={c.name} url={c.photoUrl} className="size-12 text-base" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Link
                    href={`${base}/${c.id}`}
                    className="truncate font-heading text-base font-semibold uppercase leading-tight tracking-wide outline-none transition-colors after:absolute after:inset-0 after:content-[''] hover:text-gold focus-visible:text-gold"
                  >
                    {c.name}
                  </Link>
                  <StatusBadge active={c.active} className="xl:hidden" />
                </div>
              </div>
            </div>

            <div className={cn("flex min-w-0 flex-col text-sm text-muted-foreground", !c.active && "opacity-60")}>
              <span className="truncate">{c.phone ? maskPhone(c.phone) : "Sem telefone"}</span>
              {c.email ? <span className="truncate text-xs text-muted-foreground/80">{c.email}</span> : null}
            </div>

            <div className={cn("flex min-w-0 flex-col gap-0.5 text-sm text-muted-foreground", !c.active && "opacity-60")}>
              <span className="flex items-center gap-1.5 truncate" title="Unidade onde foi cadastrado">
                <Building2 className="size-3.5 shrink-0 text-gold/80" aria-hidden="true" />
                <span className="truncate">{c.originUnit ?? "Unidade não informada"}</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
                {c.viaSelf ? (
                  <Globe className="size-3 shrink-0" aria-hidden="true" />
                ) : (
                  <Store className="size-3 shrink-0" aria-hidden="true" />
                )}
                {c.viaSelf ? "Autocadastro" : "Recepção"} · {c.createdLabel}
              </span>
            </div>

            <div className="hidden xl:block">
              <StatusBadge active={c.active} />
            </div>

            <div className="relative z-10 flex xl:justify-end">
              <div className="flex w-full divide-x divide-border overflow-hidden rounded-lg border border-border bg-[#0b0b0b]/50 xl:w-auto">
                <Link
                  href={`${base}/${c.id}`}
                  className={cn(actionBtn, "flex-1 hover:bg-gold/10 hover:text-gold focus-visible:bg-gold/10 focus-visible:text-gold xl:flex-none")}
                >
                  <Pencil className="size-4" />
                  Abrir
                </Link>
                <form action={toggleCustomerActiveAction.bind(null, slug, c.id, !c.active)} className="flex flex-1 xl:flex-none">
                  <button
                    type="submit"
                    title={c.active ? "Desativar cliente" : "Reativar cliente"}
                    className={cn(
                      actionBtn,
                      "w-full cursor-pointer xl:w-10 xl:px-0",
                      c.active
                        ? "hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
                        : "text-gold hover:bg-gold/10 focus-visible:bg-gold/10",
                    )}
                  >
                    <Power className="size-4" />
                    <span className="xl:sr-only">{c.active ? "Desativar" : "Reativar"}</span>
                  </button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

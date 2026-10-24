"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pencil, Power, Search } from "lucide-react";
import { toggleProductActiveAction } from "@/app/u/[slug]/produtos/actions";
import { Button } from "@/components/ui/button";
import { ProductIcon } from "./product-icon";
import { ActiveStatus } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

export type ProductListItem = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  categoryLabel: string;
  priceLabel: string;
  active: boolean;
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const COLS = "xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_8rem_6.5rem_10rem]";

const actionBtn =
  "inline-flex h-10 items-center justify-center gap-2 px-4 font-label text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground outline-none transition-colors xl:h-9";

export function ProductList({ slug, products }: { slug: string; products: ProductListItem[] }) {
  const [query, setQuery] = useState("");
  const base = `/u/${slug}/produtos`;

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return products;
    return products.filter((p) => normalize([p.name, p.categoryLabel, p.description ?? ""].join(" ")).includes(q));
  }, [products, query]);

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
          aria-label="Buscar produto"
          autoComplete="off"
          className="field-luxe h-11 w-full min-w-0 rounded-lg border border-input pr-3 pl-11 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
        <div className={cn("label-caps hidden gap-x-5 border-b border-border bg-black/20 px-5 py-3 text-[0.65rem] xl:grid", COLS)} aria-hidden="true">
          <span>Produto</span>
          <span>Categoria</span>
          <span>Preço</span>
          <span>Status</span>
          <span className="text-right">Ações</span>
        </div>

        {shown.length === 0 ? (
          <EmptyState
            framed={false}
            size="section"
            icon={Search}
            title="Nenhum produto encontrado"
            description="Confira o que foi digitado na busca."
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => setQuery("")}>
                Limpar busca
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((p) => (
              <li
                key={p.id}
                className={cn(
                  "relative grid items-center gap-x-5 gap-y-3 px-4 py-4 transition-colors hover:bg-white/[0.035] focus-within:bg-white/[0.035] sm:px-5",
                  COLS,
                )}
              >
                <div className={cn("flex min-w-0 items-center gap-3", !p.active && "opacity-60")}>
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-gold/25 bg-gold/10 text-gold">
                    <ProductIcon category={p.category} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <Link
                        href={`${base}/${p.id}`}
                        className="truncate font-heading text-base font-semibold uppercase leading-tight tracking-wide outline-none transition-colors after:absolute after:inset-0 after:content-[''] hover:text-gold focus-visible:text-gold"
                      >
                        {p.name}
                      </Link>
                      <ActiveStatus active={p.active} className="xl:hidden" />
                    </div>
                    {p.description ? (
                      <p className="truncate text-sm text-muted-foreground">{p.description}</p>
                    ) : (
                      <p className="truncate text-sm text-muted-foreground/60 xl:hidden">{p.categoryLabel}</p>
                    )}
                  </div>
                </div>

                <p className={cn("hidden truncate text-sm text-muted-foreground xl:block", !p.active && "opacity-60")}>{p.categoryLabel}</p>

                <span className={cn("font-heading text-base font-semibold tracking-wide text-foreground", !p.active && "opacity-60")}>
                  {p.priceLabel}
                </span>

                <div className="hidden xl:block">
                  <ActiveStatus active={p.active} />
                </div>

                <div className="relative z-10 flex xl:justify-end">
                  <div className="flex w-full divide-x divide-border overflow-hidden rounded-lg border border-border bg-[#0b0b0b]/50 xl:w-auto">
                    <Link
                      href={`${base}/${p.id}`}
                      className={cn(actionBtn, "flex-1 hover:bg-gold/10 hover:text-gold focus-visible:bg-gold/10 focus-visible:text-gold xl:flex-none")}
                    >
                      <Pencil className="size-4" />
                      Editar
                    </Link>
                    <form action={toggleProductActiveAction.bind(null, slug, p.id, !p.active)} className="flex flex-1 xl:flex-none">
                      <button
                        type="submit"
                        title={p.active ? "Desativar produto" : "Reativar produto"}
                        className={cn(
                          actionBtn,
                          "w-full cursor-pointer xl:w-10 xl:px-0",
                          p.active
                            ? "hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
                            : "text-gold hover:bg-gold/10 focus-visible:bg-gold/10",
                        )}
                      >
                        <Power className="size-4" />
                        <span className="xl:sr-only">{p.active ? "Desativar" : "Reativar"}</span>
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {shown.length === products.length
          ? `${products.length} ${products.length === 1 ? "produto" : "produtos"}`
          : `Mostrando ${shown.length} de ${products.length}`}
      </p>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabDef<T extends string> = { id: T; label: string; icon: LucideIcon };

/**
 * Abas no padrão luxe: texto em caixa alta, ativa em dourado com filete embaixo.
 * `errorTabs` marca com um ponto vermelho as abas que têm campo com erro.
 * Teclado: setas esquerda/direita, Home e End (padrão WAI-ARIA de abas).
 */
export function TabList<T extends string>({
  tabs,
  active,
  onChange,
  errorTabs,
  idPrefix,
  label,
}: {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  errorTabs?: Set<T>;
  idPrefix: string;
  label: string;
}) {
  // Em telas estreitas a faixa rola de lado: mantém a aba ativa à vista (clique, teclado ou aba aberta por erro).
  useEffect(() => {
    document
      .getElementById(`${idPrefix}-tab-${active}`)
      ?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [active, idPrefix]);

  function onKeyDown(e: React.KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === active);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next]!.id);
    document.getElementById(`${idPrefix}-tab-${tabs[next]!.id}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(({ id, label: text, icon: Icon }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            id={`${idPrefix}-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(
              "relative flex cursor-pointer items-center gap-2 whitespace-nowrap px-4 py-3 font-label text-xs uppercase tracking-[0.16em] outline-none transition-colors",
              selected ? "text-gold" : "text-muted-foreground hover:text-cream focus-visible:text-cream",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {text}
            {errorTabs?.has(id) ? (
              <span className="size-1.5 rounded-full bg-destructive" aria-label="Há campos com erro" />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-x-3 bottom-0 h-0.5 origin-center rounded-full bg-gold transition-transform duration-300",
                selected ? "scale-x-100" : "scale-x-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

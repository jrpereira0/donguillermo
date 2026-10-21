"use client";

import * as React from "react";
import { Check, ChevronDown, Plus, Search, type LucideIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** Ícone de linha opcional à esquerda (lucide). */
  icon?: LucideIcon;
};

type Props = {
  id?: string;
  /** Nome do campo no formulário (envia o valor escolhido). */
  name?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Campo de busca no painel e a primeira opção em destaque. */
  searchable?: boolean;
  /** Gatilho no padrão de botão (contorno dourado), em vez do campo. */
  button?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
};

/**
 * LISTA DE OPÇÕES DA MARCA (`.select-luxe`): campo no padrão `.field-luxe` que abre um
 * painel escuro com filete dourado; a opção em foco ganha fundo dourado suave e a
 * escolhida leva um check. Teclado completo (setas, Home/End, digitar para buscar, Esc),
 * leitor de tela e envio em formulário (Radix Select). No celular o painel também é
 * nosso, em vez do seletor do sistema.
 */
function menuPlace(trigger: HTMLElement | null) {
  const rect = trigger?.getBoundingClientRect();
  const below = rect ? window.innerHeight - rect.bottom - 12 : 320;
  const above = rect ? rect.top - 12 : 0;
  const side: "top" | "bottom" = below >= 220 || below >= above ? "bottom" : "top";
  const room = side === "bottom" ? below : above;
  return { side, height: Math.max(168, Math.min(300, room)) };
}

export function Select({
  id,
  name,
  value,
  onValueChange,
  options,
  placeholder = "Selecione",
  searchable = false,
  button = false,
  searchPlaceholder = "Buscar",
  disabled,
  invalid,
  className,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [place, setPlace] = React.useState(() => menuPlace(null));
  const searchRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!searchable || !open) return;
    const focusInput = () => searchRef.current?.focus({ preventScroll: true });
    const soon = window.setTimeout(focusInput, 0);
    const afterPlace = window.setTimeout(focusInput, 50);
    const onFocusIn = (event: FocusEvent) => {
      const field = searchRef.current;
      if (!field || event.target === field) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[role='listbox']")) return;
      focusInput();
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      window.clearTimeout(soon);
      window.clearTimeout(afterPlace);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [open, searchable]);
  const SelectedIcon = options.find((o) => o.value === value)?.icon;

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    if (!q && value) {
      const current = base.find((o) => o.value === value);
      if (current) return [current, ...base.filter((o) => o.value !== value)];
    }
    return base;
  }, [options, query, value]);
  const first = searchable ? visible[0] : undefined;
  const rest = searchable ? visible.slice(1) : options;

  function choose(next: string) {
    onValueChange(next);
    if (searchable) {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <SelectPrimitive.Root
      name={name}
      value={value || undefined}
      onValueChange={choose}
      disabled={disabled}
      open={searchable ? open : undefined}
      onOpenChange={(next) => {
        if (!searchable) return;
        if (next) setPlace(menuPlace(triggerRef.current));
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <SelectPrimitive.Trigger
        ref={triggerRef}
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(
          button
            ? "group inline-flex h-11 w-full min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-gold/60 bg-surface px-4 font-label text-xs font-medium uppercase tracking-[0.18em] text-gold outline-none hover:border-gold hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-gold data-[state=open]:border-gold data-[state=open]:bg-surface-2"
            : "field-luxe group flex h-11 w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border border-input bg-surface px-3 text-left text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground data-[state=open]:border-gold data-[state=open]:shadow-[0_0_0_3px_rgb(192_160_98/0.14)] md:text-sm",
          className,
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-2.5", button && "justify-center")}>
          {button ? <Plus className="size-4 shrink-0" aria-hidden="true" /> : null}
          {SelectedIcon ? <SelectedIcon className="size-4 shrink-0 text-gold/80" aria-hidden="true" /> : null}
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        {button ? null : (
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-gold transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
        )}
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          side={searchable ? place.side : undefined}
          align="start"
          avoidCollisions={button || !searchable}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "select-luxe z-[80] w-[var(--radix-select-trigger-width)] min-w-[12rem] overflow-hidden rounded-xl border border-gold/40 bg-gradient-to-b from-[#2a2a2a] to-[#171717] p-1.5 text-foreground shadow-[0_24px_60px_-12px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(242_237_228/0.07)]",
            searchable ? "flex flex-col" : "max-h-[min(20rem,var(--radix-select-content-available-height))]",
            // Menus abertos pelos botões de ação são mais largos que o botão:
            // nome e preço ficam em uma linha só, sem quebrar a informação.
            button && "w-[min(32rem,calc(100vw-1.5rem))] min-w-[min(20rem,calc(100vw-1.5rem))]",
          )}
          style={searchable ? { height: place.height } : undefined}
        >
          {searchable ? (
            <div className="px-1 pb-1.5" onPointerDown={(e) => e.stopPropagation()}>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gold/80" aria-hidden="true" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" && first) {
                      e.preventDefault();
                      choose(first.value);
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setOpen(false);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  autoComplete="off"
                  autoFocus
                  className="field-luxe h-10 w-full rounded-lg border border-input pr-3 pl-10 text-sm text-cream outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          ) : null}
          {searchable && !first ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Nenhum resultado</p>
          ) : null}
          <SelectPrimitive.Viewport className={searchable ? "scroll-luxe min-h-0 flex-1 overflow-y-auto" : undefined}>
            {searchable && first ? (
              <div className="px-1 pb-1">
                <p className="label-caps px-2 pt-0.5 pb-1 text-[0.6rem] text-gold/80">Primeira opção</p>
                <SelectPrimitive.Item
                  value={first.value}
                  className="relative flex cursor-pointer items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 py-2.5 pr-9 pl-3 text-sm whitespace-nowrap text-cream outline-none select-none hover:bg-gold/15 data-[highlighted]:bg-gold/15"
                >
                  {first.icon ? (
                    <span className="flex size-4 shrink-0 text-gold/80" aria-hidden="true">
                      {React.createElement(first.icon, { className: "size-4" })}
                    </span>
                  ) : null}
                  <SelectPrimitive.ItemText>{first.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center">
                    <Check className="size-4 text-gold" strokeWidth={2.5} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              </div>
            ) : null}
            {rest.map(({ value: v, label, icon: Icon }) => (
              <SelectPrimitive.Item
                key={v}
                value={v}
                className="relative flex cursor-pointer items-center gap-3 rounded-lg py-2.5 pr-9 pl-3 text-base whitespace-nowrap text-muted-foreground outline-none transition-colors select-none hover:bg-gold/10 hover:text-cream data-[highlighted]:bg-gold/10 data-[highlighted]:text-cream data-[state=checked]:text-gold md:text-sm"
              >
                {Icon ? <Icon className="size-4 shrink-0 text-gold/80" aria-hidden="true" /> : null}
                <SelectPrimitive.ItemText>{label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center">
                  <Check className="size-4 text-gold" strokeWidth={2.5} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

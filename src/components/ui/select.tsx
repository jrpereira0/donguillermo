"use client";

import * as React from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
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
export function Select({
  id,
  name,
  value,
  onValueChange,
  options,
  placeholder = "Selecione",
  disabled,
  invalid,
  className,
}: Props) {
  const SelectedIcon = options.find((o) => o.value === value)?.icon;
  return (
    <SelectPrimitive.Root name={name} value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(
          "field-luxe group flex h-11 w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border border-input bg-surface px-3 text-left text-base outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground data-[state=open]:border-gold data-[state=open]:shadow-[0_0_0_3px_rgb(192_160_98/0.14)] md:text-sm",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {SelectedIcon ? <SelectedIcon className="size-4 shrink-0 text-gold/80" aria-hidden="true" /> : null}
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-gold transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="select-luxe z-[80] max-h-[min(20rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-[12rem] overflow-hidden rounded-xl border border-gold/40 bg-gradient-to-b from-[#2a2a2a] to-[#171717] p-1.5 text-foreground shadow-[0_24px_60px_-12px_rgb(0_0_0/0.9),inset_0_1px_0_rgb(242_237_228/0.07)]"
        >
          <SelectPrimitive.Viewport>
            {options.map(({ value: v, label, icon: Icon }) => (
              <SelectPrimitive.Item
                key={v}
                value={v}
                className="relative flex cursor-pointer select-none items-center gap-3 rounded-lg py-2.5 pl-3 pr-9 text-base text-muted-foreground outline-none transition-colors data-[highlighted]:bg-gold/10 data-[highlighted]:text-cream data-[state=checked]:text-gold md:text-sm"
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

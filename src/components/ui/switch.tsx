import * as React from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Texto ao lado do botão. */
  children?: React.ReactNode;
  /** Classes do rótulo (container). */
  labelClassName?: string;
};

/**
 * Interruptor (liga/desliga). É um checkbox nativo com `role="switch"`: funciona em
 * formulário sem JavaScript (envia `on` quando ligado), com teclado (Espaço) e leitor
 * de tela. Dourado quando ligado.
 */
export function Switch({ className, labelClassName, children, ...props }: SwitchProps) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-2.5 text-sm text-muted-foreground transition-colors has-[:checked]:text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        labelClassName,
      )}
    >
      <input type="checkbox" role="switch" className={cn("peer sr-only", className)} {...props} />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 shrink-0 rounded-full border border-border bg-[#2a2a2a] transition-colors duration-200 after:absolute after:left-0.5 after:top-1/2 after:size-3.5 after:-translate-y-1/2 after:rounded-full after:bg-muted-foreground after:transition-all after:duration-200 peer-checked:border-gold peer-checked:bg-gold peer-checked:after:translate-x-4 peer-checked:after:bg-[#141414] peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50"
      />
      {children}
    </label>
  );
}

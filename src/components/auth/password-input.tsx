"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Input>, "type"> & {
  /** Ícone opcional à esquerda do campo. */
  leadingIcon?: React.ReactNode;
};

/** Campo de senha com botão para mostrar/ocultar. */
export function PasswordInput({ leadingIcon, className, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="group relative">
      {leadingIcon ? (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
          {leadingIcon}
        </span>
      ) : null}
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-11", leadingIcon && "pl-11", className)}
      />
      <button
        type="button"
        // Não tira o foco do campo ao clicar: o cursor continua onde estava.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 z-10 flex w-11 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground outline-none transition-colors hover:text-gold focus-visible:text-gold"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
  className?: string;
};

const ICONS = { error: CircleAlert, success: CircleCheck, info: Info } as const;

/**
 * Aviso de formulário no PADRÃO luxe (`.alert-luxe`): painel escuro simples com
 * ícone de linha (lucide) na cor do tom. `error` usa role="alert" (leitores de tela
 * anunciam na hora) e treme levemente ao aparecer.
 */
export function FormAlert({ tone, children, className }: Props) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-tone={tone}
      className={cn("alert-luxe", className)}
    >
      <Icon className="alert-luxe__icon size-4" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

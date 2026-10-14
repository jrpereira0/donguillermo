import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  tone: "error" | "success" | "info";
  /** Opcional: título curto em destaque; o `children` vira o texto de apoio. */
  title?: string;
  children: React.ReactNode;
  className?: string;
};

const ICONS = { error: CircleAlert, success: CircleCheck, info: Info } as const;

/**
 * Aviso de formulário no PADRÃO luxe (`.alert-luxe`): painel escuro simples com
 * ícone de linha (lucide) na cor do tom. Mensagens longas: use `title` para um
 * título curto e deixe a explicação em `children`. `error` usa role="alert"
 * (leitores de tela anunciam na hora) e treme levemente ao aparecer.
 */
export function FormAlert({ tone, title, children, className }: Props) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-tone={tone}
      className={cn("alert-luxe", className)}
    >
      <Icon className="alert-luxe__icon size-4" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? (
          <>
            <p className="font-medium text-cream">{title}</p>
            <div className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">
              {children}
            </div>
          </>
        ) : (
          children
        )}
      </div>
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

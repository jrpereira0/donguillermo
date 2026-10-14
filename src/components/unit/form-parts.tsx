import type { LucideIcon } from "lucide-react";
import { FieldError } from "@/components/auth/form-alert";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Seção de formulário no padrão luxe: painel escuro, título em caixa alta com ícone dourado. */
export function FormSection({
  icon: Icon,
  title,
  description,
  delay = 0,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Atraso (ms) da animação de entrada. */
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "reveal rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 p-5 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)] sm:p-6",
        className,
      )}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <header className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-heading text-base font-semibold uppercase tracking-wide">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Rótulo + campo + dica + erro. */
export function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

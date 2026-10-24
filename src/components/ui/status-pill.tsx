import { cn } from "@/lib/utils";

/** Tom do selo. Sucesso, atenção (ouro), neutro e alerta — só cores da marca. */
export type StatusTone = "success" | "gold" | "muted" | "danger";

const TONE: Record<StatusTone, { pill: string; dot: string }> = {
  success: { pill: "border-success/40 bg-success/10 text-success", dot: "bg-success" },
  gold: { pill: "border-gold/40 bg-gold/10 text-gold", dot: "bg-gold" },
  muted: { pill: "border-border text-muted-foreground", dot: "bg-muted-foreground/50" },
  danger: { pill: "border-destructive/40 bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

/**
 * Selo de status da marca: pílula em caixa alta, borda fina e, se quiser, uma bolinha.
 * Use no lugar de pintar cada lista com a sua cor.
 */
export function StatusPill({
  tone,
  children,
  dot = false,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-label text-[0.65rem] uppercase tracking-[0.18em]",
        TONE[tone].pill,
        className,
      )}
    >
      {dot ? <span className={cn("size-1.5 rounded-full", TONE[tone].dot)} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** Ativo (verde da marca) ou Inativo (neutro), com a bolinha. */
export function ActiveStatus({ active, className }: { active: boolean; className?: string }) {
  return (
    <StatusPill tone={active ? "success" : "muted"} dot className={className}>
      {active ? "Ativo" : "Inativo"}
    </StatusPill>
  );
}

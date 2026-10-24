import type { LucideIcon } from "lucide-react";
import { LuxeFrame } from "@/components/ui/luxe-frame";
import { cn } from "@/lib/utils";

/**
 * Estado vazio da unidade: círculo dourado, título em caixa alta e um texto curto.
 * `page` ocupa a tela (catálogo ainda vazio). `section` cabe dentro de uma aba ou lista.
 * `framed` envolve no cartão de destaque; dentro de uma tabela, use sem moldura.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  framed = true,
  size = "page",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  framed?: boolean;
  size?: "page" | "section";
  className?: string;
}) {
  const page = size === "page";
  const body = (
    <>
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full border border-gold/40 bg-background text-gold shadow-[0_0_32px_rgb(192_160_98/0.2)]",
          page ? "size-16" : "size-14",
        )}
      >
        <Icon className={page ? "size-7" : "size-6"} aria-hidden="true" />
      </span>
      <p className={cn("font-heading uppercase tracking-wide", page ? "mt-6 text-xl" : "mt-5 text-lg")}>{title}</p>
      {description ? <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-6 w-full sm:w-auto">{action}</div> : null}
      {children}
    </>
  );

  if (!framed) {
    return <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>{body}</div>;
  }

  return (
    <LuxeFrame
      className={cn("reveal", className)}
      style={{ "--d": "150ms" } as React.CSSProperties}
      contentClassName={cn("flex flex-col items-center px-6 text-center", page ? "py-12 sm:py-14" : "py-10")}
    >
      {body}
    </LuxeFrame>
  );
}

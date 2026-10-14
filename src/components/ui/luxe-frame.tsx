import { cn } from "@/lib/utils";

type Props = React.ComponentProps<"div"> & {
  /** Classes do conteúdo interno (padding etc.). */
  contentClassName?: string;
};

/**
 * PADRÃO DE CARD DE DESTAQUE: vidro escuro, moldura em degradê dourado e um
 * brilho dourado que gira na borda. Use em cards principais (login, resumos
 * importantes). `className` vai na moldura externa; `contentClassName` no miolo.
 * (ver docs/design-tokens.md > "Padrões de interface")
 */
export function LuxeFrame({ className, contentClassName, children, ...props }: Props) {
  return (
    <div className={cn("luxe-frame", className)} {...props}>
      <div className={cn("luxe-card", contentClassName)}>{children}</div>
    </div>
  );
}

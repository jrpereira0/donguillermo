import { createElement } from "react";
import { cn } from "@/lib/utils";
import { serviceIcon } from "./service-categories";

/** Ícone da categoria do serviço. */
export function ServiceIcon({ category, className }: { category: string; className?: string }) {
  return createElement(serviceIcon(category), { className, "aria-hidden": true });
}

/**
 * Miniatura do serviço: a imagem enviada ou, sem imagem, o ícone da categoria num quadrado
 * de borda dourada. Tamanho e cantos vêm do `className` (ex.: "size-12 rounded-xl").
 */
export function ServiceThumb({
  url,
  category,
  className,
  iconClassName = "size-5",
}: {
  url: string | null;
  category: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden border border-gold/40 bg-[#101010] text-gold",
        className,
      )}
    >
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
      ) : (
        <ServiceIcon category={category} className={iconClassName} />
      )}
    </span>
  );
}

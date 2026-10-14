/* eslint-disable @next/next/no-img-element */
import { brand } from "@/config/brand";

/**
 * Marca no topo das telas. Usa o logo oficial quando `logoSrc` estiver
 * definido em src/config/brand.ts; enquanto isso, mostra o nome em tipografia da marca.
 */
export function BrandMark({ size = "lg" }: { size?: "md" | "lg" }) {
  if (brand.logoSrc) {
    return (
      <img
        src={brand.logoSrc}
        alt={brand.name}
        className={size === "lg" ? "h-16 w-auto" : "h-10 w-auto"}
      />
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span
        className={`font-heading font-bold uppercase leading-none tracking-wide text-foreground ${
          size === "lg" ? "text-4xl" : "text-2xl"
        }`}
      >
        {brand.name}
      </span>
      <span className="label-caps text-gold">{brand.tagline}</span>
    </div>
  );
}

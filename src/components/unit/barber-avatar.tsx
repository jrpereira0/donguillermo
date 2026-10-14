/* eslint-disable @next/next/no-img-element */
import { initialsOf } from "@/lib/validation/barber";
import { cn } from "@/lib/utils";

/** Foto redonda do profissional; sem foto, mostra as iniciais em dourado. */
export function BarberAvatar({
  name,
  url,
  className,
}: {
  name: string;
  url: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gold/40 bg-[#101010] font-heading text-lg font-semibold text-gold",
        className,
      )}
    >
      {url ? (
        <img src={url} alt={`Foto de ${name}`} className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}

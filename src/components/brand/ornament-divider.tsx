/** Filete dourado com losango central. Puramente decorativo. */
export function OrnamentDivider({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`flex items-center gap-3 ${className}`}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold/60" />
      <span className="size-1.5 rotate-45 bg-gold shadow-[0_0_10px_rgb(192_160_98/0.8)]" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold/60" />
    </div>
  );
}

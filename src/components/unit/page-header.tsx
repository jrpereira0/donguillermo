import { OrnamentDivider } from "@/components/brand/ornament-divider";

/** Cabeçalho padrão das páginas da unidade (mesma receita do AuthHeading, alinhado à esquerda). */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  /** Botão/ação à direita (ex.: "Novo profissional"). */
  action?: React.ReactNode;
}) {
  return (
    <div className="reveal flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <p className="label-caps text-gold">{eyebrow}</p>
        <h1 className="bg-gradient-to-b from-cream from-40% to-[#d6bb83] bg-clip-text text-[clamp(1.75rem,4vw,2.25rem)] leading-tight text-transparent">
          {title}
        </h1>
        <OrnamentDivider className="w-40" />
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

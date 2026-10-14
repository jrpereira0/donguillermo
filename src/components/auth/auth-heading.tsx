import { OrnamentDivider } from "@/components/brand/ornament-divider";

/**
 * Cabeçalho PADRÃO das telas de acesso (login, esqueci a senha, definir senha):
 * eyebrow dourado, título em degradê, filete ornamental e descrição.
 */
export function AuthHeading({
  eyebrow,
  title,
  description,
  delay = 450,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  /** Atraso (ms) da animação de entrada. */
  delay?: number;
}) {
  return (
    <div
      className="reveal flex flex-col items-center gap-2 text-center"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <p className="label-caps text-gold">{eyebrow}</p>
      <h1 className="bg-gradient-to-b from-cream from-40% to-[#d6bb83] bg-clip-text text-[clamp(1.75rem,4.6vh,2.25rem)] leading-tight text-transparent">
        {title}
      </h1>
      <OrnamentDivider className="w-40" />
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

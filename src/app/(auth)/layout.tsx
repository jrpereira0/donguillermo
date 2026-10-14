import { BrandMark } from "@/components/brand/brand-mark";
import { LuxeFrame } from "@/components/ui/luxe-frame";

/** Atraso de entrada (ms) de cada bloco, para a cena "acender" em sequência. */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

/** Cantoneiras douradas nos cantos da tela (só em telas maiores). */
function Corners() {
  const base = "reveal pointer-events-none absolute hidden size-12 border-gold/35 md:block";
  return (
    <div aria-hidden>
      <span className={`${base} left-8 top-8 border-l border-t`} style={delay(900)} />
      <span className={`${base} right-8 top-8 border-r border-t`} style={delay(1000)} />
      <span className={`${base} bottom-8 left-8 border-b border-l`} style={delay(1100)} />
      <span className={`${base} bottom-8 right-8 border-b border-r`} style={delay(1200)} />
    </div>
  );
}

/**
 * Layout das telas de acesso (login, recuperação, nova senha).
 * Ocupa exatamente a altura da janela (`h-dvh`) e dimensiona logo e espaços pela
 * altura (vh), para o login caber sem rolagem. Só rola se a janela for mínima.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-stage relative isolate h-dvh overflow-y-auto overflow-x-hidden">
      <Corners />

      <main className="relative z-10 mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-[clamp(0.75rem,2.6vh,1.75rem)] px-6 py-[clamp(0.75rem,3vh,2rem)]">
        <header className="flex justify-center">
          <BrandMark square />
        </header>

        <LuxeFrame
          className="reveal"
          style={delay(350)}
          contentClassName="p-[clamp(1.25rem,3.4vh,2rem)]"
        >
          {children}
        </LuxeFrame>

        <p className="reveal label-caps text-center text-[0.65rem] opacity-70" style={delay(800)}>
          Acesso restrito à equipe
        </p>
      </main>
    </div>
  );
}

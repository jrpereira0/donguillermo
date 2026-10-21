import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página não encontrada" };

/** 404 da casa: português, visual dourado/escuro do sistema (nada do padrão do Next). */
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-12">
      <header className="flex justify-center">
        <BrandMark />
      </header>
      <div className="flex flex-col items-center gap-5 rounded-xl border border-border bg-card p-6 text-center sm:p-8">
        <span className="flex size-14 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
          <Compass className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="label-caps text-[0.65rem] text-gold">Erro 404</p>
          <h1 className="font-heading text-2xl font-semibold uppercase tracking-wide text-cream">
            Página não encontrada
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Este endereço não existe ou foi movido. Confira o link ou volte para o início.
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "luxe", size: "lg", className: "w-full sm:w-auto" })}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}

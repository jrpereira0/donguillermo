import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Layers, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/unit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LuxeFrame } from "@/components/ui/luxe-frame";
import { FlashNotice } from "@/components/ui/notice";
import { requireUnitArea } from "@/lib/auth/guards";
import { listPackages } from "@/lib/packages/queries";
import { formatBRL } from "@/lib/validation/service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Pacotes" };
export const instant = false;

const fmtPct = (n: number) => `${String(n).replace(".", ",")}%`;

export default async function PacotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { slug } = await params;
  const { aviso } = await searchParams;
  const { unit } = await requireUnitArea(slug, "pacotes");
  const packages = await listPackages(unit.id);
  const base = `/u/${slug}/pacotes`;

  const newButton = (
    <Link href={`${base}/novo`} className={buttonVariants({ variant: "luxe", size: "lg", className: "w-full sm:w-auto" })}>
      <Plus />
      Novo pacote
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Catálogo"
        title="Pacotes"
        description="Pacotes pré-pagos: o cliente compra os serviços com desconto, paga uma vez e usa nas próximas visitas sem pagar de novo. Venda e acompanhe o saldo na ficha do cliente."
        action={packages.length ? newButton : undefined}
      />

      {aviso === "criado" ? (
        <FlashNotice title="Pacote cadastrado">Ele já pode ser vendido na ficha do cliente (aba Pacotes).</FlashNotice>
      ) : null}

      {packages.length === 0 ? (
        <LuxeFrame
          className="reveal"
          style={{ "--d": "150ms" } as React.CSSProperties}
          contentClassName="flex flex-col items-center px-6 py-12 text-center sm:py-14"
        >
          <span className="relative flex size-16 items-center justify-center rounded-full border border-gold/40 bg-[#101010] text-gold shadow-[0_0_32px_rgb(192_160_98/0.2)]">
            <Layers className="size-7" aria-hidden="true" />
          </span>
          <p className="mt-6 font-heading text-xl uppercase tracking-wide">Monte o primeiro pacote</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Escolha os serviços (ex.: 4 cortes), dê um desconto em % e venda para o cliente. Nas próximas visitas ele
            usa o saldo do pacote na comanda, sem pagar de novo.
          </p>
          <div className="mt-6 w-full sm:w-auto">{newButton}</div>
        </LuxeFrame>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
          <header className="flex items-center gap-3 border-b border-border/80 bg-black/20 px-4 py-3 sm:px-5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              <Layers className="size-4" aria-hidden="true" />
            </span>
            <h2 className="min-w-0 flex-1 font-heading text-base font-semibold uppercase tracking-wide text-cream">
              Pacotes da unidade
            </h2>
            <span className="label-caps shrink-0 text-[0.62rem]">
              {packages.length} {packages.length === 1 ? "pacote" : "pacotes"}
            </span>
          </header>
          <ul className="divide-y divide-border/70">
            {packages.map((p) => (
              <li key={p.id}>
                <Link
                  href={`${base}/${p.id}`}
                  className={cn("group grid gap-3 px-4 py-4 transition-colors hover:bg-gold/[0.05] sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center", !p.isActive && "opacity-55")}
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-base font-semibold uppercase tracking-wide text-cream">{p.name}</span>
                      {!p.isActive ? (
                        <span className="label-caps rounded-full border border-border bg-black/30 px-2 py-0.5 text-[0.55rem] text-muted-foreground">
                          Desativado
                        </span>
                      ) : null}
                      {p.discountPct > 0 ? (
                        <span className="label-caps rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[0.55rem] text-gold">
                          −{fmtPct(p.discountPct)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">
                      {p.items.map((i) => `${i.quantity}× ${i.serviceName}`).join(" · ") || "Sem serviços"}
                      {p.validityDays ? ` · vale ${p.validityDays} dias` : ""}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="size-3.5 text-gold/70" aria-hidden="true" />
                      {p.buyersCount} {p.buyersCount === 1 ? "cliente comprou" : "clientes compraram"}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 lg:flex-col lg:items-end lg:gap-0.5">
                    {p.discountPct > 0 ? (
                      <span className="text-xs tabular-nums text-muted-foreground line-through">{formatBRL(p.listCents)}</span>
                    ) : null}
                    <span className="font-heading text-xl font-semibold tabular-nums text-gold">{formatBRL(p.priceCents)}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold lg:hidden" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Para vender: abra a ficha do cliente, aba <strong className="font-medium text-cream">Pacotes</strong>, e escolha o
        pacote — abre a comanda da venda e, ao cobrar, o pacote fica ativo para ele usar nas próximas visitas.
      </p>
    </div>
  );
}

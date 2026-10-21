import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Percent, Receipt, Scale, Trophy, type LucideIcon } from "lucide-react";
import { CommissionFilter } from "@/components/caixa/commission-filter";
import { BarberAvatar } from "@/components/unit/barber-avatar";
import { PageHeader } from "@/components/unit/page-header";
import { requireUnitArea } from "@/lib/auth/guards";
import { getBarberCommissionDetail } from "@/lib/commissions/queries";
import { periodLabel, resolvePeriod } from "@/lib/commissions/period";
import { maskPhone } from "@/lib/validation/barber";
import { formatBRL } from "@/lib/validation/service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Comissão do barbeiro" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const whenFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function Panel({
  icon: Icon,
  title,
  right,
  children,
  gold,
}: {
  icon: LucideIcon;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]",
        gold ? "border-gold/30" : "border-border",
      )}
    >
      <header className="flex items-center gap-3 border-b border-border/80 bg-black/20 px-4 py-3 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="min-w-0 flex-1 font-heading text-base font-semibold uppercase tracking-wide text-cream">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: "gold" | "cream" }) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 px-4 py-4 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
      <p className="label-caps text-[0.62rem]">{label}</p>
      <p className={cn("mt-1.5 font-heading text-[1.55rem] font-semibold leading-none tabular-nums", accent === "gold" ? "text-gold" : "text-cream")}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[0.7rem] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const fmtPct = (n: number) => `${String(n).replace(".", ",")}%`;

export default async function ComissaoBarbeiroPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; barberId: string }>;
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  await connection();
  const { slug, barberId } = await params;
  if (!UUID.test(barberId)) notFound();
  const period = resolvePeriod(await searchParams);
  const { unit } = await requireUnitArea(slug, "comissoes");
  const detail = await getBarberCommissionDetail(unit.id, barberId, period.fromISO, period.toISO);
  if (!detail) notFound();
  const { barber } = detail;
  const qs = `?de=${period.de}&ate=${period.ate}`;
  const totalReceber = detail.commissionCents + detail.tipsCents;
  const producao = detail.servicesCents + detail.productsCents;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/u/${slug}/comissoes${qs}`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Comissões
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <BarberAvatar name={barber.name} url={null} className="size-16 text-xl" />
        <div className="min-w-0 flex-1">
          <PageHeader
            eyebrow="Comissão do barbeiro"
            title={barber.name}
            description={`${barber.jobTitle}${barber.phone ? ` · ${maskPhone(barber.phone)}` : ""} · período de ${periodLabel(period.de, period.ate)}.`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="label-caps rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[0.6rem] text-gold">
            Serviços: tabela progressiva{detail.bracketRange ? ` (${detail.bracketRange})` : ""}
          </span>
          <span className="label-caps rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[0.6rem] text-gold">
            {fmtPct(barber.pctProducts)} sobre produtos
          </span>
          {!barber.isActive ? (
            <span className="label-caps rounded-full border border-border bg-black/30 px-3 py-1.5 text-[0.6rem] text-muted-foreground">
              Inativo
            </span>
          ) : null}
        </div>
      </div>

      <CommissionFilter basePath={`/u/${slug}/comissoes/${barberId}`} de={period.de} ate={period.ate} today={period.today} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="A receber no período" value={formatBRL(totalReceber)} hint="Comissão + gorjetas" accent="gold" />
        <Kpi label="Comissão" value={formatBRL(detail.commissionCents)} hint="Serviços pela faixa do mês · produtos pelo % do cadastro" />
        <Kpi label="Produção" value={formatBRL(producao)} hint={`${detail.tickets.length} ${detail.tickets.length === 1 ? "comanda" : "comandas"} com itens dele`} />
        <Kpi label="Atendimentos concluídos" value={String(detail.appointmentsDone)} hint="Na agenda, no período" />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          icon={Receipt}
          title="Comandas no período"
          right={
            <span className="label-caps shrink-0 text-[0.62rem]">
              {detail.tickets.length} {detail.tickets.length === 1 ? "comanda" : "comandas"}
            </span>
          }
        >
          {detail.tickets.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nenhuma comanda fechada com itens deste barbeiro no período.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {detail.tickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/u/${slug}/caixa/comanda/${t.id}`}
                    className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gold/[0.05] sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-cream">{t.customerName}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {t.items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.name}`).join(", ")}
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] text-muted-foreground/80">
                        {whenFmt.format(new Date(t.closedAt))}
                        {t.tipCents ? ` · gorjeta ${formatBRL(t.tipCents)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium tabular-nums text-cream">
                        {formatBRL(t.servicesCents + t.productsCents)}
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] tabular-nums text-gold">
                        comissão {formatBRL(t.commissionCents)}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-6">
          <Panel icon={Scale} title="Cálculo do período" gold>
            <div className="flex flex-col gap-1 px-5 py-4 text-sm">
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Serviços vendidos</span>
                <span className="tabular-nums text-cream">{formatBRL(detail.servicesCents)}</span>
              </span>
              {detail.months.length ? (
                detail.months.map((m) => (
                  <span key={m.key} className="flex justify-between gap-3 py-1 text-muted-foreground">
                    <span>
                      Comissão de {m.label} ({fmtPct(m.pct)} de {formatBRL(m.servicesCents)})
                    </span>
                    <span className="tabular-nums text-cream">{formatBRL(m.commissionCents)}</span>
                  </span>
                ))
              ) : (
                <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                  <span>Comissão de serviços</span>
                  <span className="tabular-nums text-cream">{formatBRL(0)}</span>
                </span>
              )}
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Produtos vendidos</span>
                <span className="tabular-nums text-cream">{formatBRL(detail.productsCents)}</span>
              </span>
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Comissão de produtos ({fmtPct(barber.pctProducts)})</span>
                <span className="tabular-nums text-cream">
                  {formatBRL(Math.round((detail.productsCents * barber.pctProducts) / 100))}
                </span>
              </span>
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Gorjetas (integrais)</span>
                <span className="tabular-nums text-gold">{formatBRL(detail.tipsCents)}</span>
              </span>
              <div className="mt-3 flex items-end justify-between gap-3 rounded-xl border border-gold/30 bg-gold/[0.07] px-4 py-3">
                <span className="label-caps text-[0.62rem] text-gold">A receber</span>
                <span className="font-heading text-2xl font-semibold leading-none tabular-nums text-gold">
                  {formatBRL(totalReceber)}
                </span>
              </div>
              <p className="mt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
                Comissão sobre o valor dos itens do barbeiro, antes do desconto da comanda. Serviços: tabela
                progressiva da rede, com o % da faixa do faturamento dele em cada mês. Produtos: % do cadastro.
              </p>
            </div>
          </Panel>

          <Panel icon={Trophy} title="Mais vendidos">
            {detail.topItems.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Nada vendido no período.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {detail.topItems.map((i) => (
                  <li key={`${i.kind}:${i.name}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-cream">{i.name}</span>
                      <span className="mt-0.5 block text-[0.7rem] text-muted-foreground">
                        {i.kind === "produto" ? "Produto" : "Serviço"} · {i.count}×
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-gold">{formatBRL(i.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={Percent} title="Percentuais">
            <div className="flex flex-col gap-2 px-5 py-4 text-sm text-muted-foreground">
              <span className="flex justify-between gap-3">
                <span>Sobre serviços</span>
                <span className="text-right font-medium tabular-nums text-cream">
                  Tabela progressiva{detail.bracketRange ? ` (${detail.bracketRange})` : ""}
                </span>
              </span>
              <span className="flex justify-between gap-3">
                <span>Sobre produtos</span>
                <span className="font-medium tabular-nums text-cream">{fmtPct(barber.pctProducts)}</span>
              </span>
              <Link href={`/u/${slug}/profissionais/${barber.id}`} className="link-luxe label-caps mt-2 inline-block py-1 text-[0.6rem]">
                Editar produtos no cadastro do profissional
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

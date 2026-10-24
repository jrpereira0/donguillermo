import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarDays,
  ChevronRight,
  Package,
  PieChart,
  Receipt,
  Scale,
  Scissors,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { CommissionFilter } from "@/components/caixa/commission-filter";
import { BarberAvatar } from "@/components/unit/barber-avatar";
import { PageHeader } from "@/components/unit/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { requireUnitArea } from "@/lib/auth/guards";
import { utcToZoned } from "@/lib/agenda/time";
import { getBarberCommissionDetail, type BarberTopItem } from "@/lib/commissions/queries";
import { periodLabel, resolvePeriod } from "@/lib/commissions/period";
import { formatBRL } from "@/lib/validation/service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Desempenho do barbeiro" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const whenFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const GOLD = "var(--brand-gold)";
const CREAM = "var(--brand-cream)";

/** Casca única de todo card da página. */
const CARD =
  "overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]";

function Panel({
  icon: Icon,
  title,
  value,
  pad = true,
  children,
}: {
  icon: LucideIcon;
  title: string;
  /** Número-resumo, sempre no mesmo lugar do cabeçalho. */
  value?: string;
  /** false em listas e tabelas, que encostam na borda. */
  pad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(CARD, "flex h-full flex-col")}>
      <header className="flex h-14 items-center gap-3 border-b border-border/80 bg-black/20 px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="min-w-0 flex-1 truncate font-heading text-base font-semibold tracking-wide text-cream uppercase">{title}</h2>
        {value ? <span className="shrink-0 font-heading text-sm font-semibold tabular-nums text-gold">{value}</span> : null}
      </header>
      <div className={cn("flex min-h-0 flex-1 flex-col", pad && "gap-4 p-5")}>{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={cn(CARD, "flex h-full flex-col px-4 py-4")}>
      <p className="label-caps truncate text-[0.62rem]">{label}</p>
      <p className="mt-2 truncate font-heading text-[1.45rem] leading-none font-semibold tabular-nums text-cream">{value}</p>
      <p className="mt-2 truncate text-[0.7rem] text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Número interno: o mesmo bloco em todos os cards. */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-black/25 px-3.5 py-3">
      <p className="label-caps truncate text-[0.58rem]">{label}</p>
      <p className="mt-1.5 truncate font-heading text-lg leading-none font-semibold tabular-nums text-cream">{value}</p>
      <p className="mt-1.5 h-4 truncate text-[0.68rem] text-muted-foreground">{hint ?? "\u00a0"}</p>
    </div>
  );
}

/** Barra horizontal: a mesma em ranking, comparação e financeiro. */
function BarRow({
  label,
  value,
  width,
  meta,
  hint,
}: {
  label: string;
  value: string;
  width: number;
  meta?: string;
  hint?: string;
}) {
  return (
    <li>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0">
          <span className="block truncate text-muted-foreground">{label}</span>
          {hint ? <span className="mt-0.5 block truncate text-[0.68rem] text-muted-foreground/80">{hint}</span> : null}
        </span>
        <span className="shrink-0 tabular-nums text-cream">{value}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold/35 to-gold"
            style={{ width: `${Math.max(width > 0 ? 3 : 0, Math.min(100, width))}%` }}
          />
        </div>
        {meta ? <span className="w-10 shrink-0 text-right text-[0.68rem] tabular-nums text-muted-foreground">{meta}</span> : null}
      </div>
    </li>
  );
}

function ColumnChart({ buckets }: { buckets: { label: string; total: number }[] }) {
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const ticks = [max, max / 2, 0];
  const every = buckets.length <= 14 ? 1 : Math.ceil(buckets.length / 7);
  const axis = (cents: number) => {
    const reais = cents / 100;
    if (reais >= 1000) return `${(reais / 1000).toFixed(reais >= 10000 ? 0 : 1).replace(".", ",")} mil`;
    return String(Math.round(reais));
  };
  return (
    <div className="flex gap-2">
      <div className="flex h-36 w-9 shrink-0 flex-col justify-between text-right text-[0.6rem] tabular-nums text-muted-foreground">
        {ticks.map((t, i) => (
          <span key={i}>{axis(t)}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative h-36">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
            <span className="border-t border-white/[0.07]" />
            <span className="border-t border-white/[0.05]" />
            <span className="border-t border-white/[0.1]" />
          </div>
          <div className="absolute inset-0 flex items-end gap-[3px]" role="img" aria-label="Produção por dia">
            {buckets.map((b, i) => (
              <div key={i} className="group relative flex h-full min-w-0 flex-1 items-end">
                <span className="pointer-events-none absolute top-1 left-1/2 z-10 hidden -translate-x-1/2 rounded-md border border-gold/40 bg-[#141414] px-1.5 py-0.5 text-[0.62rem] whitespace-nowrap text-cream shadow-lg group-hover:block">
                  {formatBRL(b.total)}
                </span>
                <div
                  className="w-full rounded-t-[3px] bg-gradient-to-t from-gold/25 to-gold"
                  style={{ height: b.total > 0 ? `${Math.max(4, (b.total / max) * 100)}%` : "0%" }}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex gap-[3px]">
          {buckets.map((b, i) => (
            <span key={i} className="min-w-0 flex-1 truncate text-center text-[0.58rem] text-muted-foreground">
              {i % every === 0 || i === buckets.length - 1 ? b.label : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MixDonut({ services, products }: { services: number; products: number }) {
  const total = services + products;
  const r = 42;
  const circ = 2 * Math.PI * r;
  const share = total > 0 ? services / total : 0;
  const both = services > 0 && products > 0;
  const gap = both ? circ * 0.012 : 0;
  const a = Math.max(0, share * circ - gap);
  const b = Math.max(0, (1 - share) * circ - gap);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <div className="relative size-36">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="13" />
          {a > 0 ? (
            <circle cx="60" cy="60" r={r} fill="none" stroke={GOLD} strokeWidth="13" strokeDasharray={`${a} ${circ}`} />
          ) : null}
          {b > 0 ? (
            <circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={CREAM}
              strokeOpacity="0.72"
              strokeWidth="13"
              strokeDasharray={`${b} ${circ}`}
              strokeDashoffset={-(share * circ)}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="label-caps text-[0.55rem]">Produção</span>
          <span className="mt-1 font-heading text-sm font-semibold tabular-nums text-cream">{formatBRL(total)}</span>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-3">
        <Tile label="Serviços" value={formatBRL(services)} hint={fmtPct1(total ? (services / total) * 100 : 0)} />
        <Tile label="Produtos" value={formatBRL(products)} hint={fmtPct1(total ? (products / total) * 100 : 0)} />
      </div>
    </div>
  );
}

function RankBars({ items, empty }: { items: BarberTopItem[]; empty: string }) {
  if (items.length === 0) {
    return <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  const max = Math.max(...items.map((i) => i.totalCents), 1);
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((i) => (
        <BarRow
          key={`${i.kind}:${i.name}`}
          label={i.name}
          value={formatBRL(i.totalCents)}
          width={(i.totalCents / max) * 100}
          meta={`${i.count}×`}
        />
      ))}
    </ul>
  );
}

const fmtPct = (n: number) => `${String(n).replace(".", ",")}%`;
const fmtPct1 = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;
const fmtRatio = (n: number) => n.toFixed(2).replace(".", ",");
const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const addDayIso = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

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

  const comandas = detail.tickets.length;
  const ticketMedio = comandas > 0 ? Math.round(producao / comandas) : 0;
  const clientes = new Set(detail.tickets.map((t) => t.customerName)).size;
  const pctEfetiva = producao > 0 ? (detail.commissionCents / producao) * 100 : 0;

  let servicosQtd = 0;
  let servicosPacote = 0;
  let produtosQtd = 0;
  for (const t of detail.tickets) {
    for (const i of t.items) {
      if (i.kind === "servico") {
        servicosQtd += i.quantity;
        if (i.fromPackage) servicosPacote += i.quantity;
      } else if (i.kind === "produto") produtosQtd += i.quantity;
    }
  }
  const ratio = detail.appointmentsDone > 0 ? servicosQtd / detail.appointmentsDone : null;
  const compareMax = Math.max(detail.appointmentsDone, servicosQtd, 1);
  const comandasComProduto = detail.tickets.filter((t) => t.productsCents > 0).length;
  const adesao = comandas > 0 ? (comandasComProduto / comandas) * 100 : 0;
  const ticketProduto = comandasComProduto > 0 ? Math.round(detail.productsCents / comandasComProduto) : 0;
  const comGorjeta = detail.tickets.filter((t) => t.tipCents > 0).length;
  const gorjetaMedia = comGorjeta > 0 ? Math.round(detail.tipsCents / comGorjeta) : 0;
  const pctServicos = detail.servicesCents > 0 ? (detail.servicesCommissionCents / detail.servicesCents) * 100 : 0;

  const byDay = new Map<string, number>();
  for (const t of detail.tickets) {
    const d = utcToZoned(t.openedAt).date;
    byDay.set(d, (byDay.get(d) ?? 0) + t.servicesCents + t.productsCents);
  }
  const days: { key: string; total: number }[] = [];
  for (let d = period.de; d <= period.ate; d = addDayIso(d)) days.push({ key: d, total: byDay.get(d) ?? 0 });
  const diasComVenda = days.filter((d) => d.total > 0).length;
  const mediaDia = days.length > 0 ? Math.round(producao / days.length) : 0;
  const weekly = days.length > 45;
  type Bucket = { label: string; total: number };
  const buckets: Bucket[] = weekly
    ? Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => {
        const slice = days.slice(i * 7, i * 7 + 7);
        return { label: shortDay(slice[0]!.key), total: slice.reduce((a, s) => a + s.total, 0) };
      })
    : days.map((d) => ({ label: shortDay(d.key), total: d.total }));
  const best = buckets.reduce<Bucket | null>((win, b) => (b.total > (win?.total ?? 0) ? b : win), null);

  const servicosRanking = detail.topItems.filter((i) => i.kind !== "produto");
  const topServicos = [
    ...servicosRanking.filter((i) => !i.fromPackage).slice(0, 5),
    ...servicosRanking.filter((i) => i.fromPackage).slice(0, 5),
  ];
  const topProdutos = detail.topItems.filter((i) => i.kind === "produto").slice(0, 5);
  const receberBase = Math.max(totalReceber, 1);

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/u/${slug}/comissoes${qs}`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Comissões
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <BarberAvatar name={barber.name} url={null} className="size-16 text-xl" />
        <div className="min-w-0 flex-1">
          <PageHeader
            eyebrow="Desempenho do barbeiro"
            title={barber.name}
            description={`${barber.jobTitle} · ${periodLabel(period.de, period.ate)}.`}
          />
        </div>
        {!barber.isActive ? <StatusPill tone="muted">Inativo</StatusPill> : null}
      </div>

      <CommissionFilter basePath={`/u/${slug}/comissoes/${barberId}`} de={period.de} ate={period.ate} today={period.today} />

      <section className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="A receber" value={formatBRL(totalReceber)} hint="Comissão e gorjetas" />
        <Kpi label="Produção" value={formatBRL(producao)} hint={`${comandas} ${comandas === 1 ? "comanda" : "comandas"}`} />
        <Kpi label="Comissão" value={formatBRL(detail.commissionCents)} hint={`${fmtPct1(pctEfetiva)} da produção`} />
        <Kpi label="Ticket médio" value={formatBRL(ticketMedio)} hint="Por comanda fechada" />
        <Kpi
          label="Serviços / atendimento"
          value={ratio !== null ? fmtRatio(ratio) : "—"}
          hint={ratio !== null ? `${servicosQtd} serviços ÷ ${detail.appointmentsDone} atendimentos` : "Sem atendimento no período"}
        />
      </section>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.7fr)_22rem]">
        <Panel icon={TrendingUp} title={weekly ? "Produção por semana" : "Produção por dia"} value={formatBRL(producao)}>
          {producao === 0 ? (
            <p className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">Sem produção no período.</p>
          ) : (
            <>
              <ColumnChart buckets={buckets} />
              <div className="grid grid-cols-3 gap-3">
                <Tile label={weekly ? "Melhor semana" : "Melhor dia"} value={best ? best.label : "—"} hint={best ? formatBRL(best.total) : undefined} />
                <Tile label="Dias com venda" value={`${diasComVenda} de ${days.length}`} />
                <Tile label="Média por dia" value={formatBRL(mediaDia)} />
              </div>
            </>
          )}
        </Panel>

        <Panel icon={PieChart} title="Mix da produção" value={formatBRL(producao)}>
          <MixDonut services={detail.servicesCents} products={detail.productsCents} />
        </Panel>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <Panel icon={Scissors} title="Serviços" value={formatBRL(detail.servicesCents)}>
          <div className="grid grid-cols-3 gap-3">
            <Tile
              label="Realizados"
              value={String(servicosQtd)}
              hint={servicosPacote > 0 ? `${servicosPacote} pelo pacote` : undefined}
            />
            <Tile label="Vendido" value={formatBRL(detail.servicesCents)} />
            <Tile
              label="Comissão"
              value={formatBRL(detail.servicesCommissionCents)}
              hint={barber.servicesOwnPct !== null ? `${fmtPct(barber.servicesOwnPct)} próprio` : `Faixa ${fmtPct1(pctServicos)}`}
            />
          </div>
          <RankBars items={topServicos} empty="Nenhum serviço vendido no período." />
        </Panel>

        <Panel icon={Package} title="Produtos" value={formatBRL(detail.productsCents)}>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Vendido" value={formatBRL(detail.productsCents)} />
            <Tile label="Adesão" value={fmtPct1(adesao)} hint={`${comandasComProduto} de ${comandas}`} />
            <Tile label="Ticket" value={formatBRL(ticketProduto)} hint={`${produtosQtd} ${produtosQtd === 1 ? "item" : "itens"}`} />
          </div>
          <RankBars items={topProdutos} empty="Nenhum produto vendido no período." />
        </Panel>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <Panel icon={CalendarCheck} title="Atendimentos" value={ratio !== null ? fmtRatio(ratio) : "—"}>
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Concluídos" value={String(detail.appointmentsDone)} hint="Na agenda" />
            <Tile label="Comandas" value={String(comandas)} hint="Fechadas no período" />
            <Tile label="Clientes" value={String(clientes)} hint="Nomes distintos" />
            <Tile label="Dias com venda" value={String(diasComVenda)} hint={`de ${days.length} dias`} />
          </div>
          <ul className="flex flex-col gap-3.5">
            <BarRow label="Atendimentos" value={String(detail.appointmentsDone)} width={(detail.appointmentsDone / compareMax) * 100} />
            <BarRow label="Serviços realizados" value={String(servicosQtd)} width={(servicosQtd / compareMax) * 100} />
            <BarRow label="Pelo pacote" value={String(servicosPacote)} width={(servicosPacote / compareMax) * 100} />
          </ul>
        </Panel>

        <Panel icon={Scale} title="Financeiro" value={formatBRL(totalReceber)}>
          <ul className="flex flex-1 flex-col gap-3.5">
            <BarRow
              label="Comissão de serviços"
              value={formatBRL(detail.servicesCommissionCents)}
              width={(detail.servicesCommissionCents / receberBase) * 100}
              hint={
                barber.servicesOwnPct !== null
                  ? `${fmtPct(barber.servicesOwnPct)} próprio · sobre ${formatBRL(detail.servicesCents)}`
                  : `Faixa de ${fmtPct1(pctServicos)}${detail.bracketRange ? ` · tabela ${detail.bracketRange}` : ""} · sobre ${formatBRL(detail.servicesCents)}`
              }
            />
            <BarRow
              label="Comissão de produtos"
              value={formatBRL(detail.productsCommissionCents)}
              width={(detail.productsCommissionCents / receberBase) * 100}
              hint={`${fmtPct(barber.pctProducts)} · sobre ${formatBRL(detail.productsCents)}`}
            />
            <BarRow
              label="Gorjetas"
              value={formatBRL(detail.tipsCents)}
              width={(detail.tipsCents / receberBase) * 100}
              hint={comGorjeta ? `${comGorjeta} ${comGorjeta === 1 ? "comanda" : "comandas"} · média ${formatBRL(gorjetaMedia)}` : "Nenhuma no período"}
            />
          </ul>
          <Link href={`/u/${slug}/profissionais/${barber.id}`} className="link-luxe label-caps mt-auto inline-block py-0.5 text-[0.6rem]">
            Ver cadastro do profissional
          </Link>
        </Panel>
      </div>

      <Panel icon={Receipt} title="Comandas" value={String(comandas)} pad={false}>
        {comandas === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma comanda fechada neste período.</p>
        ) : (
          <ul>
            <li className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_8rem_7rem_7.5rem_1rem] gap-3 border-b border-border/60 px-5 py-2 lg:grid">
              {["Cliente", "Itens", "Quando", "Produção", "Comissão", ""].map((h, i) => (
                <span key={i} className={cn("label-caps text-[0.58rem]", i === 3 || i === 4 ? "text-right" : "")}>
                  {h}
                </span>
              ))}
            </li>
            {detail.tickets.map((t) => (
              <li key={t.id} className="border-b border-border/50 last:border-b-0">
                <Link
                  href={`/u/${slug}/caixa/comanda/${t.id}`}
                  className="group grid items-center gap-1 px-4 py-3.5 transition-colors hover:bg-gold/[0.05] sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_8rem_7rem_7.5rem_1rem] lg:gap-3"
                >
                  <span className="truncate text-sm font-medium text-cream group-hover:text-gold">{t.customerName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t.items.map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.name}`).join(", ")}
                  </span>
                  <span className="text-xs text-muted-foreground lg:text-[0.8rem]">
                    {whenFmt.format(new Date(t.openedAt))}
                    {t.tipCents ? <span className="text-gold/80"> · {formatBRL(t.tipCents)}</span> : null}
                  </span>
                  <span className="text-sm tabular-nums text-cream lg:text-right">{formatBRL(t.servicesCents + t.productsCents)}</span>
                  <span className="text-sm tabular-nums text-gold lg:text-right">{formatBRL(t.commissionCents)}</span>
                  <ChevronRight className="hidden size-4 text-muted-foreground group-hover:text-gold lg:block" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {detail.months.length > 1 ? (
        <Panel icon={CalendarDays} title="Comissão de serviços por mês" pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left">
                  {["Mês", "Serviços vendidos", "Faixa", "Comissão"].map((h, i) => (
                    <th key={h} className={cn("label-caps px-5 py-2.5 text-[0.58rem] font-medium", i > 0 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {detail.months.map((m) => (
                  <tr key={m.key}>
                    <td className="px-5 py-3 font-medium text-cream capitalize">{m.label}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-cream">{formatBRL(m.servicesCents)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmtPct(m.pct)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gold">{formatBRL(m.commissionCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

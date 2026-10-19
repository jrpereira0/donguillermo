import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  ChevronRight,
  CreditCard,
  Lock,
  QrCode,
  Receipt,
  RotateCcw,
  Scale,
  ScrollText,
  Unlock,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/unit/page-header";
import { ReopenRegisterButton } from "@/components/caixa/reopen-register-button";
import { requireUnitArea } from "@/lib/auth/guards";
import { getClosedRegister, getOpenRegister, listClosedRegisters, listRegisterEvents, listRegisterMovements, listRegisterPayments, listRegisterTickets } from "@/lib/caixa/queries";
import { PAY_METHODS, payMethodLabel, type PayMethod } from "@/lib/caixa/math";
import { formatBRL } from "@/lib/validation/service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Caixa fechado" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const bizLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
const bizShort = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });

const METHOD_ICONS: Record<PayMethod, LucideIcon> = {
  dinheiro: Banknote,
  pix: QrCode,
  debito: CreditCard,
  credito: CreditCard,
};

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

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "gold" | "cream" | "success" | "amber" | "rose";
}) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 px-4 py-4 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
      <p className="label-caps text-[0.62rem]">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-heading text-[1.55rem] font-semibold leading-none tabular-nums",
          accent === "gold" && "text-gold",
          accent === "success" && "text-emerald-300",
          accent === "amber" && "text-amber-200",
          accent === "rose" && "text-rose-300",
          (!accent || accent === "cream") && "text-cream",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[0.7rem] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default async function CaixaHistoricoDetalhePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const { unit } = await requireUnitArea(slug, "caixa");
  const register = await getClosedRegister(unit.id, id);
  if (!register) notFound();
  const [methods, movements, tickets, openRegister, closedList, events] = await Promise.all([
    listRegisterPayments(id),
    listRegisterMovements(id),
    listRegisterTickets(id),
    getOpenRegister(unit.id),
    listClosedRegisters(unit.id),
    listRegisterEvents(id),
  ]);
  const canReopen = !openRegister && closedList[0]?.id === register.id;

  const diff = register.countedCashCents - register.expectedCashCents;
  const methodsSum = PAY_METHODS.reduce((acc, m) => acc + (methods[m.value] ?? 0), 0);
  const suprimento = movements.filter((m) => m.kind === "suprimento").reduce((a, m) => a + m.amountCents, 0);
  const sangria = movements.filter((m) => m.kind === "sangria").reduce((a, m) => a + m.amountCents, 0);
  const ticketMedio = tickets.length ? Math.round(register.totalCents / tickets.length) : 0;
  const gorjetas = tickets.reduce((a, t) => a + t.tipCents, 0);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/u/${slug}/caixa?aba=historico`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Caixa
      </Link>

      <PageHeader
        eyebrow="Financeiro · caixa do dia"
        title={bizLong.format(new Date(`${register.businessDate}T12:00:00`))}
        description={`Data de referência: ${bizShort.format(new Date(`${register.businessDate}T12:00:00`))}. Aberto ${when.format(new Date(register.openedAt))} por ${register.openedByName ?? "recepção"} · fechado ${when.format(new Date(register.closedAt))} por ${register.closedByName ?? "recepção"}.`}
        action={canReopen ? <ReopenRegisterButton slug={slug} registerId={register.id} /> : undefined}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Faturado"
          value={formatBRL(register.totalCents)}
          hint={tickets.length ? `${tickets.length} ${tickets.length === 1 ? "comanda" : "comandas"} · média ${formatBRL(ticketMedio)}` : "Nenhuma comanda"}
          accent="gold"
        />
        <Kpi label="Esperado em dinheiro" value={formatBRL(register.expectedCashCents)} hint="Fundo + vendas em dinheiro e movimentos" />
        <Kpi label="Contado" value={formatBRL(register.countedCashCents)} hint="Dinheiro conferido no fechamento" />
        <Kpi
          label="Diferença"
          value={diff === 0 ? formatBRL(0) : diff > 0 ? `+${formatBRL(diff)}` : `−${formatBRL(-diff)}`}
          hint={diff === 0 ? "Bateu com o esperado" : diff > 0 ? "Sobra na gaveta" : "Falta na gaveta"}
          accent={diff === 0 ? "success" : diff > 0 ? "amber" : "rose"}
        />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            icon={Receipt}
            title="Comandas do caixa"
            right={
              <span className="label-caps shrink-0 text-[0.62rem]">
                {tickets.length} {tickets.length === 1 ? "comanda" : "comandas"}
              </span>
            }
          >
            {tickets.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma comanda recebida neste caixa.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/u/${slug}/caixa/comanda/${t.id}`}
                      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gold/[0.05] sm:px-5"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 font-heading text-sm text-gold">
                        {(t.customerName || "?").trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-cream">{t.customerName}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {t.items.join(", ") || "Sem itens"}
                        </span>
                        <span className="mt-0.5 block text-[0.7rem] text-muted-foreground/80">
                          {t.closedAt ? `${timeFmt.format(new Date(t.closedAt))} · ` : ""}
                          {t.payments
                            .map(
                              (p) =>
                                `${payMethodLabel(p.method)}${p.method === "credito" && p.installments > 1 ? ` ${p.installments}x` : ""}`,
                            )
                            .join(" · ")}
                          {t.tipCents ? ` · gorjeta ${formatBRL(t.tipCents)}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums text-gold">{formatBRL(t.totalCents)}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={ArrowLeftRight} title="Movimentos">
            {movements.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum suprimento ou sangria neste caixa.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {movements.map((m) => {
                  const entrada = m.kind === "suprimento";
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                          entrada
                            ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-300"
                            : "border-rose-300/30 bg-rose-300/10 text-rose-300",
                        )}
                      >
                        {entrada ? <ArrowUpRight className="size-4" aria-hidden="true" /> : <ArrowDownRight className="size-4" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-cream">{entrada ? "Suprimento" : "Sangria"}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {timeFmt.format(new Date(m.createdAt))}
                          {m.note ? ` · ${m.note}` : ""}
                          {m.authorName ? ` · ${m.authorName}` : ""}
                        </span>
                      </span>
                      <span className={cn("shrink-0 text-sm font-medium tabular-nums", entrada ? "text-emerald-300" : "text-rose-300")}>
                        {entrada ? "+" : "−"} {formatBRL(m.amountCents)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel icon={ScrollText} title="Registro de alterações">
            {events.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Sem registros para este caixa.</p>
            ) : (
              <ol className="flex flex-col px-4 py-4 sm:px-5">
                {events.map((e, i) => {
                  const conf = {
                    abertura: { icon: Unlock, label: "Caixa aberto", classes: "border-emerald-300/30 bg-emerald-300/10 text-emerald-300" },
                    fechamento: { icon: Lock, label: "Caixa fechado", classes: "border-gold/30 bg-gold/10 text-gold" },
                    reabertura: { icon: RotateCcw, label: "Caixa reaberto", classes: "border-amber-300/30 bg-amber-300/10 text-amber-200" },
                  }[e.kind];
                  const Icon = conf.icon;
                  const diffEv =
                    e.countedCents !== null && e.expectedCents !== null ? e.countedCents - e.expectedCents : null;
                  return (
                    <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                      {i < events.length - 1 ? (
                        <span className="absolute left-[15px] top-9 h-[calc(100%-2rem)] w-px bg-border/70" aria-hidden="true" />
                      ) : null}
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", conf.classes)}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 pt-0.5">
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="text-sm font-medium text-cream">{conf.label}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">{when.format(new Date(e.createdAt))}</span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          {e.actorName ? `Por ${e.actorName}. ` : ""}
                          {e.kind === "abertura" && e.openingCents !== null
                            ? `Fundo de ${formatBRL(e.openingCents)}.`
                            : ""}
                          {e.kind === "fechamento" && e.countedCents !== null
                            ? `Contado ${formatBRL(e.countedCents)}${e.expectedCents !== null ? ` · esperado ${formatBRL(e.expectedCents)}` : ""}${diffEv !== null && diffEv !== 0 ? ` · ${diffEv > 0 ? "sobra" : "falta"} de ${formatBRL(Math.abs(diffEv))}` : diffEv === 0 ? " · sem diferença" : ""}.`
                            : ""}
                          {e.kind === "reabertura" ? "Fechamento desfeito; o caixa voltou a ficar aberto." : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        <aside className="flex flex-col gap-6 xl:sticky xl:top-6">
          <Panel icon={Wallet} title="Formas de pagamento" gold>
            <ul className="flex flex-col gap-4 px-5 py-4">
              {PAY_METHODS.map(({ value: method, label }) => {
                const Icon = METHOD_ICONS[method];
                const value = methods[method] ?? 0;
                const pct = methodsSum > 0 ? Math.round((value / methodsSum) * 100) : 0;
                return (
                  <li key={method} className={cn(!value && "opacity-45")}>
                    <div className="flex items-center gap-2.5 text-sm">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-black/30 text-gold">
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                      <span className="tabular-nums font-medium text-cream">{formatBRL(value)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold/50 to-gold"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {gorjetas ? (
              <p className="flex justify-between border-t border-border/70 px-5 py-3 text-sm text-muted-foreground">
                <span>Gorjetas incluídas</span>
                <span className="tabular-nums text-gold">{formatBRL(gorjetas)}</span>
              </p>
            ) : null}
          </Panel>

          <Panel icon={Scale} title="Conferência da gaveta">
            <div className="flex flex-col gap-1 px-5 py-4 text-sm">
              <span className="flex justify-between gap-3 border-b border-border/70 pb-2.5 text-muted-foreground">
                <span>Data de referência</span>
                <span className="font-medium capitalize text-gold">{bizShort.format(new Date(`${register.businessDate}T12:00:00`))}</span>
              </span>
              <span className="flex justify-between gap-3 py-1 pt-2.5 text-muted-foreground">
                <span>Fundo de abertura</span>
                <span className="tabular-nums text-cream">{formatBRL(register.openingCents)}</span>
              </span>
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Vendas em dinheiro</span>
                <span className="tabular-nums text-cream">{formatBRL(methods.dinheiro ?? 0)}</span>
              </span>
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Suprimentos</span>
                <span className="tabular-nums text-emerald-300">+ {formatBRL(suprimento)}</span>
              </span>
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Sangrias</span>
                <span className="tabular-nums text-rose-300">− {formatBRL(sangria)}</span>
              </span>
              <span className="mt-2 flex justify-between gap-3 border-t border-border/70 py-2 text-muted-foreground">
                <span>Esperado na gaveta</span>
                <span className="tabular-nums font-medium text-cream">{formatBRL(register.expectedCashCents)}</span>
              </span>
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Contado no fechamento</span>
                <span className="tabular-nums text-cream">{formatBRL(register.countedCashCents)}</span>
              </span>
              <div
                className={cn(
                  "mt-3 flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
                  diff === 0
                    ? "border-emerald-300/30 bg-emerald-300/[0.07]"
                    : diff > 0
                      ? "border-amber-300/30 bg-amber-300/[0.07]"
                      : "border-rose-300/30 bg-rose-300/[0.07]",
                )}
              >
                <span className="label-caps text-[0.62rem]">{diff === 0 ? "Bateu" : diff > 0 ? "Sobra" : "Falta"}</span>
                <span
                  className={cn(
                    "font-heading text-xl font-semibold leading-none tabular-nums",
                    diff === 0 ? "text-emerald-300" : diff > 0 ? "text-amber-200" : "text-rose-300",
                  )}
                >
                  {diff === 0 ? formatBRL(0) : diff > 0 ? `+${formatBRL(diff)}` : `−${formatBRL(-diff)}`}
                </span>
              </div>
            </div>
            {register.notes ? (
              <div className="border-t border-border/70 px-5 py-3.5">
                <p className="label-caps text-[0.6rem]">Observação do fechamento</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{register.notes}</p>
              </div>
            ) : null}
          </Panel>
        </aside>
      </div>
    </div>
  );
}

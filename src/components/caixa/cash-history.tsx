"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { PeriodFilter, type PeriodPreset } from "@/components/ui/period-filter";
import type { ClosedRegister } from "@/lib/caixa/types";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/validation/service";

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const bizFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });

/** Histórico de fechamentos com filtro de data — usado na página do Caixa (fechado ou na aba Histórico). */
export function CashHistoryPanel({ slug, history }: { slug: string; history: ClosedRegister[] }) {
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");

  const spDay = (offset: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(Date.now() + offset * 86_400_000),
    );
  const chips = [
    { label: "Tudo", from: "", to: "" },
    { label: "Hoje", from: spDay(0), to: spDay(0) },
    { label: "Ontem", from: spDay(-1), to: spDay(-1) },
    { label: "7 dias", from: spDay(-6), to: spDay(0) },
    { label: "30 dias", from: spDay(-29), to: spDay(0) },
  ];
  const filtered = history.filter(
    (r) => (!histFrom || r.businessDate >= histFrom) && (!histTo || r.businessDate <= histTo),
  );
  const totalFiltrado = filtered.reduce((a, r) => a + r.totalCents, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
      <header className="flex items-center gap-3 border-b border-border/80 bg-black/20 px-4 py-3 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
          <History className="size-4" aria-hidden="true" />
        </span>
        <h2 className="min-w-0 flex-1 font-heading text-base font-semibold uppercase tracking-wide text-cream">
          Histórico de fechamentos
        </h2>
        <span className="label-caps shrink-0 text-[0.62rem]">
          {filtered.length} {filtered.length === 1 ? "caixa" : "caixas"}
          {filtered.length ? ` · ${formatBRL(totalFiltrado)}` : ""}
        </span>
      </header>

      <div className="border-b border-border/70 px-4 py-3 sm:px-5">
        <PeriodFilter
          variant="flat"
          instant
          value={{ from: histFrom, to: histTo }}
          today={spDay(0)}
          presets={chips.map<PeriodPreset>((c) => ({ label: c.label, from: c.from, to: c.to }))}
          fromId="histDe"
          toId="histAte"
          onApply={(v) => {
            setHistFrom(v.from);
            setHistTo(v.to);
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          {history.length ? "Nenhum caixa fechado neste período." : "Nenhum caixa fechado ainda."}
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {filtered.map((r) => {
            const diff = r.countedCashCents - r.expectedCashCents;
            return (
              <li key={r.id}>
                <Link
                  href={`/u/${slug}/caixa/historico/${r.id}`}
                  className="group grid gap-3 px-4 py-4 transition-colors hover:bg-gold/[0.05] sm:grid-cols-[minmax(0,1.3fr)_auto_auto_auto] sm:items-center sm:gap-5 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-heading text-base font-semibold uppercase tracking-wide text-cream">
                      {bizFmt.format(new Date(`${r.businessDate}T12:00:00`))}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      Fechado às {timeFmt.format(new Date(r.closedAt))} por {r.closedByName ?? "Recepção"} ·{" "}
                      {r.ticketCount} {r.ticketCount === 1 ? "comanda" : "comandas"}
                    </span>
                  </span>
                  <span className="text-sm">
                    <span className="label-caps block text-[0.58rem]">Faturado</span>
                    <span className="mt-0.5 block font-medium tabular-nums text-gold">{formatBRL(r.totalCents)}</span>
                  </span>
                  <span className="text-sm">
                    <span className="label-caps block text-[0.58rem]">Contado</span>
                    <span className="mt-0.5 block tabular-nums text-muted-foreground">{formatBRL(r.countedCashCents)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={cn(
                        "label-caps rounded-full border px-2.5 py-1 text-[0.6rem]",
                        diff === 0
                          ? "border-success/40 bg-success/10 text-success"
                          : diff > 0
                            ? "border-gold/40 bg-gold/10 text-gold"
                            : "border-destructive/40 bg-destructive/10 text-destructive",
                      )}
                    >
                      {diff === 0 ? "Bateu" : diff > 0 ? `Sobra +${formatBRL(diff)}` : `Falta −${formatBRL(-diff)}`}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

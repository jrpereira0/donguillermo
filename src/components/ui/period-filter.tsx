"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarRange, Check } from "lucide-react";
import { AgendaDateField } from "@/components/agenda/mini-calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PeriodValue = { from: string; to: string };
export type PeriodPreset = { label: string } & PeriodValue;

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "19 out" ou, com ano, "19 out 2026" — resumo curto do período. */
function fmtIso(iso: string, withYear = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = `${d} ${MONTHS[(m ?? 1) - 1]}`;
  return withYear ? `${base} ${y}` : base;
}

function inclusiveDays(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/**
 * Filtro de período padrão do sistema.
 * Estrutura: resumo + intervalo personalizado na primeira linha; atalhos em
 * faixa própria ocupando a largura (viram segmento inline em telas largas).
 * `instant` aplica a cada escolha; senão, o botão Aplicar surge ao editar.
 */
export function PeriodFilter({
  value,
  today,
  presets,
  onApply,
  instant = false,
  variant = "bar",
  fromId,
  toId,
  className,
}: {
  value: PeriodValue;
  today: string;
  presets: PeriodPreset[];
  onApply: (v: PeriodValue) => void;
  instant?: boolean;
  /** `bar`: painel próprio (páginas). `flat`: sem moldura (dentro de outro painel). */
  variant?: "bar" | "flat";
  fromId?: string;
  toId?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<PeriodValue>(value);

  useEffect(() => {
    setDraft(value);
  }, [value.from, value.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = draft.from !== value.from || draft.to !== value.to;
  const activePreset = dirty
    ? undefined
    : presets.find((p) => p.from === value.from && p.to === value.to);

  const sameYear = value.from.slice(0, 4) === value.to.slice(0, 4);
  const summary =
    !value.from && !value.to
      ? "Todo o período"
      : !value.from
        ? `Até ${fmtIso(value.to)}`
        : !value.to
          ? `A partir de ${fmtIso(value.from)}`
          : value.from === value.to
            ? fmtIso(value.from)
            : `${fmtIso(value.from, !sameYear)} — ${fmtIso(value.to)}`;
  const days = value.from && value.to ? inclusiveDays(value.from, value.to) : null;

  function pick(which: "from" | "to", iso: string) {
    let next: PeriodValue =
      which === "from" ? { from: iso, to: draft.to } : { from: draft.from, to: iso };
    if (next.from && next.to && next.from > next.to) {
      next = which === "from" ? { from: iso, to: iso } : { from: iso, to: iso };
    }
    setDraft(next);
    if (instant) onApply(next);
  }

  return (
    <div
      className={cn(
        variant === "bar" &&
          "rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]",
        "flex flex-wrap items-center gap-x-4 gap-y-3",
        variant === "bar" ? "px-4 py-3.5 sm:px-5" : "",
        className,
      )}
    >
      {/* Linha 1 — esquerda: resumo do período */}
      <div className="flex min-w-0 flex-1 items-center gap-3 min-[1400px]:flex-none">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
          <CalendarRange className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="label-caps block text-[0.58rem]">Período</span>
          <span className="block truncate text-sm font-medium text-cream">
            {summary}
            {days ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {days} {days === 1 ? "dia" : "dias"}
              </span>
            ) : null}
          </span>
        </span>
      </div>

      {/* Linha 1 — direita: intervalo personalizado */}
      <div className="order-2 flex flex-wrap items-center gap-2 min-[1400px]:order-3">
        <div className="w-[9.25rem]">
          <AgendaDateField
            id={fromId}
            compact
            prefix="De"
            value={draft.from}
            today={today}
            onChange={(iso) => pick("from", iso)}
          />
        </div>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
        <div className="w-[9.25rem]">
          <AgendaDateField
            id={toId}
            compact
            prefix="Até"
            value={draft.to}
            today={today}
            onChange={(iso) => pick("to", iso)}
          />
        </div>
        {!instant && dirty ? (
          <Button type="button" variant="luxe" className="h-9 px-4 text-[0.68rem]" onClick={() => onApply(draft)}>
            <Check aria-hidden="true" />
            Aplicar
          </Button>
        ) : null}
      </div>

      {/* Linha 2 (telas largas: inline, no meio) — atalhos */}
      <div
        role="group"
        aria-label="Atalhos de período"
        className="order-3 flex w-full flex-wrap items-center gap-1 rounded-lg border border-border/80 bg-black/40 p-1 min-[1400px]:order-2 min-[1400px]:w-auto min-[1400px]:flex-1 min-[1400px]:flex-nowrap min-[1400px]:justify-center"
      >
        {presets.map((p) => {
          const active = activePreset?.label === p.label;
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setDraft({ from: p.from, to: p.to });
                onApply({ from: p.from, to: p.to });
              }}
              className={cn(
                "label-caps h-8 flex-1 cursor-pointer rounded-md px-2.5 text-[0.6rem] whitespace-nowrap transition-colors min-[1400px]:flex-none min-[1400px]:px-3",
                active
                  ? "bg-gold font-semibold text-[#171310] shadow-[0_2px_10px_rgb(192_160_98/0.35)]"
                  : "text-muted-foreground hover:bg-white/[0.06] hover:text-cream",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { addDays, isIsoDate, shortDateLabel } from "@/lib/agenda/time";
import { cn } from "@/lib/utils";

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

const monthTitle = (y: number, m: number) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m, 1)));

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type BaseProps = {
  date: string;
  today: string;
  className?: string;
  /** Chamado ao escolher um dia (ex.: fechar o popover no celular). */
  onDaySelect?: (iso: string) => void;
};

type NavProps = BaseProps & {
  /** Navegação da agenda: cada dia é um link. */
  slug: string;
  onSelect?: undefined;
};

type PickProps = BaseProps & {
  slug?: undefined;
  /** Seleção controlada (modal): cada dia é um botão. */
  onSelect: (iso: string) => void;
};

type Props = NavProps | PickProps;

/**
 * Mini-calendário mensal (estilo Google Agenda).
 * Na grade da agenda navega por link; nos modais seleciona a data via `onSelect`.
 */
export function MiniCalendar(props: Props) {
  const { date, today, className, onDaySelect } = props;
  const selected = isIsoDate(date) ? date : today;
  const [sy, sm] = selected.split("-").map(Number);
  const [browse, setBrowse] = useState<{ y: number; m: number; forDate: string } | null>(null);
  const cursor =
    browse && browse.forDate === selected ? { y: browse.y, m: browse.m } : { y: sy, m: sm - 1 };

  const cells = useMemo(() => {
    const startPad = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
    const prevDays = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();
    const out: { iso: string; day: number; inMonth: boolean }[] = [];

    for (let i = startPad - 1; i >= 0; i--) {
      out.push({
        iso: addDays(`${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-01`, -(i + 1)),
        day: prevDays - i,
        inMonth: false,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      out.push({
        iso: `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        inMonth: true,
      });
    }
    while (out.length < 42) {
      const last = out[out.length - 1]!;
      const iso = addDays(last.iso, 1);
      out.push({ iso, day: Number(iso.slice(8)), inMonth: false });
    }
    return out;
  }, [cursor.y, cursor.m]);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(cursor.y, cursor.m + delta, 1));
    setBrowse({ y: d.getUTCFullYear(), m: d.getUTCMonth(), forDate: selected });
  }

  function shiftYear(delta: number) {
    setBrowse({ y: cursor.y + delta, m: cursor.m, forDate: selected });
  }

  function pick(iso: string) {
    if ("onSelect" in props && props.onSelect) props.onSelect(iso);
    onDaySelect?.(iso);
  }

  const dayClass = (c: { iso: string; inMonth: boolean }) => {
    const isSelected = c.iso === selected;
    const isToday = c.iso === today;
    return cn(
      "flex aspect-square items-center justify-center rounded-full text-sm tabular-nums transition-colors",
      !c.inMonth && "text-muted-foreground/35",
      c.inMonth && !isSelected && "text-cream/90 hover:bg-gold/15",
      isToday && !isSelected && "font-semibold text-gold ring-1 ring-gold/50",
      isSelected && "bg-gold font-semibold text-[#101010] shadow-[0_0_16px_rgb(192_160_98/0.35)]",
    );
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-[#141414] p-4 shadow-[inset_0_1px_0_rgb(242_237_228/0.04)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-1">
        <span className="flex items-center">
          <button
            type="button"
            onClick={() => shiftYear(-1)}
            aria-label="Ano anterior"
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-gold"
          >
            <ChevronsLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Mês anterior"
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-gold"
          >
            <ChevronLeft className="size-4" />
          </button>
        </span>
        <p className="font-heading text-sm font-semibold uppercase tracking-wide">
          {capitalize(monthTitle(cursor.y, cursor.m))}
        </p>
        <span className="flex items-center">
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Próximo mês"
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-gold"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftYear(1)}
            aria-label="Próximo ano"
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-gold"
          >
            <ChevronsRight className="size-4" />
          </button>
        </span>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {WEEK.map((w, i) => (
          <span
            key={`${w}-${i}`}
            className="py-1 text-center text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground/70"
          >
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label="Calendário">
        {cells.map((c) =>
          "onSelect" in props && props.onSelect ? (
            <button
              key={c.iso}
              type="button"
              aria-current={c.iso === selected ? "date" : undefined}
              aria-label={c.iso}
              onClick={() => pick(c.iso)}
              className={cn(dayClass(c), "cursor-pointer")}
            >
              {c.day}
            </button>
          ) : (
            <Link
              key={c.iso}
              href={`/u/${props.slug}/agenda?data=${c.iso}`}
              aria-current={c.iso === selected ? "date" : undefined}
              aria-label={c.iso}
              onClick={() => onDaySelect?.(c.iso)}
              className={dayClass(c)}
            >
              {c.day}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}

/** Campo de data do sistema: calendário em portal (sobreposto ao modal). */
export function AgendaDateField({
  id,
  name,
  value,
  today,
  onChange,
  invalid,
  disabled,
  compact,
  prefix,
}: {
  id?: string;
  name?: string;
  value: string;
  today: string;
  onChange: (iso: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  /** Altura reduzida (filtros e barras compactas). */
  compact?: boolean;
  /** Rótulo curto dentro do campo (ex.: "De", "Até" em filtros de período). */
  prefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      return;
    }
    const place = () => {
      const el = btn.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(304, Math.max(r.width, 280));
      const left = Math.min(Math.max(12, r.left), window.innerWidth - width - 12);
      const below = r.bottom + 8;
      const estHeight = 340;
      const top = below + estHeight > window.innerHeight - 12 ? Math.max(12, r.top - estHeight - 8) : below;
      setBox({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btn.current?.contains(t) || pop.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={btn}
        type="button"
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-invalid={invalid || undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "field-luxe flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border text-left outline-none transition-colors",
          compact ? "h-9 px-2.5 text-[0.83rem]" : "h-11 px-3 text-base md:text-sm",
          invalid ? "border-destructive" : open ? "border-gold/55" : "border-input hover:border-gold/40",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className="flex min-w-0 items-baseline gap-1.5">
          {prefix ? (
            <span className="label-caps shrink-0 text-[0.55rem] text-muted-foreground">{prefix}</span>
          ) : null}
          <span className="truncate tabular-nums">
            {isIsoDate(value) ? shortDateLabel(value) : compact ? "Selecione" : "Escolha a data"}
          </span>
        </span>
        <CalendarDays className={cn("shrink-0 text-gold/80", compact ? "size-3.5" : "size-4")} aria-hidden="true" />
      </button>
      {open && box
        ? createPortal(
            <div
              ref={pop}
              role="dialog"
              aria-label="Escolher data"
              className="fixed z-[80] shadow-[0_24px_60px_-12px_rgb(0_0_0/0.9)]"
              style={{ top: box.top, left: box.left, width: box.width }}
            >
              <MiniCalendar
                date={value}
                today={today}
                onSelect={(iso) => {
                  onChange(iso);
                  setOpen(false);
                }}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

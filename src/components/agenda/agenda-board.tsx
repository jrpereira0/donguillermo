"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Lock, Plus, Users } from "lucide-react";
import { moveAppointmentAction, setAppointmentStatusAction } from "@/app/u/[slug]/agenda/actions";
import { loadComandaAction, type ComandaLoad } from "@/app/u/[slug]/caixa/actions";
import { ComandaDialog } from "@/components/caixa/comanda-dialog";
import { Notice } from "@/components/ui/notice";
import { Button, buttonVariants } from "@/components/ui/button";
import { BarberAvatar } from "@/components/unit/barber-avatar";
import {
  addDays,
  dayKeyOf,
  fromMinutes,
  longDateLabel,
  overlapLanes,
  roundUpTo,
  toMinutes,
  unavailableSpans,
  utcToZoned,
  windowOf,
} from "@/lib/agenda/time";
import { statusCardClass, statusRailClass } from "@/lib/agenda/status-style";
import type { AgendaBarber, AgendaEntry, AgendaOffers, AgendaService } from "@/lib/agenda/types";
import {
  occupiesSlot,
  QUICK_STATUSES,
  statusLabel,
  type AppointmentStatus,
} from "@/lib/validation/appointment";
import { formatBRL } from "@/lib/validation/service";
import { cn } from "@/lib/utils";
import { AppointmentDialog, type AppointmentTarget } from "./appointment-dialog";
import { BlockDialog, type BlockTarget } from "./block-dialog";
import { MiniCalendar } from "./mini-calendar";

type StatusMenu = { entryId: string; x: number; y: number };

const DRAG_EDITABLE = new Set(["agendado", "confirmado", "em_atendimento"]);
const DRAG_THRESHOLD = 8;

type DragState = {
  entry: AgendaEntry;
  width: number;
  height: number;
  /** Offset do clique dentro do card. */
  grabX: number;
  grabY: number;
  /** Posição do ponteiro no início (para limiar de arraste). */
  originX: number;
  originY: number;
  x: number;
  y: number;
  active: boolean;
  target: { barberId: string; startMin: number } | null;
};

type Props = {
  slug: string;
  date: string;
  today: string;
  slot: number;
  unitHours: unknown;
  barbers: AgendaBarber[];
  entries: AgendaEntry[];
  services: AgendaService[];
  offers: AgendaOffers;
  popularIds: string[];
  from: number;
  to: number;
};

type Dialog = { type: "appointment"; target: AppointmentTarget } | { type: "block"; target: BlockTarget } | null;

/** Altura (px) de cada linha: um pouco mais alta para o card respirar. */
const rowHeight = (slot: number) => (slot <= 10 ? 24 : slot <= 15 ? 30 : slot <= 20 ? 36 : slot <= 30 ? 48 : 68);
const AXIS = "3.75rem";

/**
 * Fora do expediente e bloqueio usam neutros (cinza/prata) — sem ouro, azul, âmbar, verde ou rose
 * dos status de agendamento.
 */
/** Faixa fechada: cinza escuro + listras suaves (só leitura visual de “indisponível”). */
const OFF_HOURS =
  "bg-[#121212]/92 bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.045)_0_1px,transparent_1px_8px)]";
/** Bloqueio: zebra prateada bem marcada, diferente de qualquer status. */
const BLOCK_LOOK =
  "border border-zinc-400/50 bg-[#0a0a0a] text-zinc-200 bg-[repeating-linear-gradient(135deg,rgb(161_161_170/0.22)_0_7px,transparent_7px_14px)] hover:border-zinc-300/70";
/** Listras suaves nos cards sem preferência de profissional. */
const PREF_STRIPES =
  "bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.04)_0_5px,transparent_5px_11px)]";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function hiddenKey(slug: string) {
  return `agenda-hidden-barbers:${slug}`;
}

function readHidden(slug: string): Set<string> {
  try {
    const raw = localStorage.getItem(hiddenKey(slug));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeHidden(slug: string, hidden: Set<string>) {
  try {
    localStorage.setItem(hiddenKey(slug), JSON.stringify([...hidden]));
  } catch {
    /* ignore quota / private mode */
  }
}

export function AgendaBoard({
  slug,
  date,
  today,
  slot,
  unitHours,
  barbers,
  entries,
  services,
  offers,
  popularIds,
  from,
  to,
}: Props) {
  const router = useRouter();
  const calBtn = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [comanda, setComanda] = useState<Extract<ComandaLoad, { ok: true }> | null>(null);
  const [openingComanda, startComanda] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [calBox, setCalBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [moving, startMoving] = useTransition();
  const [statusPending, startStatus] = useTransition();
  const [statusMenu, setStatusMenu] = useState<StatusMenu | null>(null);
  /** Cancelar pede confirmação dentro do próprio menu (um clique errado não cancela o cliente). */
  const [confirmCancel, setConfirmCancel] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  /** Após um arraste, o browser ainda dispara click — engolimos o próximo. */
  const swallowClickRef = useRef(false);

  const isToday = date === today;
  const ROW = rowHeight(slot);
  const rows = Math.max(1, Math.round((to - from) / slot));
  const height = rows * ROW;
  const px = (min: number) => ((min - from) / slot) * ROW;

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  /** Por geometria da coluna — não depende do que está por cima (bloqueio, fora do expediente, outro card). */
  const resolveDropTarget = useCallback(
    (clientX: number, clientY: number): { barberId: string; startMin: number } | null => {
      const cols = document.querySelectorAll<HTMLElement>("[data-agenda-col]");
      for (const col of cols) {
        const id = col.dataset.agendaCol;
        if (!id) continue;
        const rect = col.getBoundingClientRect();
        if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) {
          continue;
        }
        const y = clientY - rect.top;
        const i = Math.max(0, Math.min(rows - 1, Math.floor(y / ROW)));
        return { barberId: id, startMin: from + i * slot };
      }
      return null;
    },
    [ROW, from, rows, slot],
  );

  const visibleBarbers = useMemo(
    () => barbers.filter((b) => !hiddenIds.has(b.id)),
    [barbers, hiddenIds],
  );
  /** Com muitos profissionais visíveis, cabeçalhos e cards ficam mais densos — sem scroll horizontal. */
  const dense = visibleBarbers.length >= 6;

  useEffect(() => {
    if (!isToday) return;
    const tick = () => setNowMin(utcToZoned(new Date()).minutes);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      setNowMin(null);
    };
  }, [isToday]);

  // Mantém a grade alinhada ao banco (recepção + agendamento no navegador).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  // Ao trocar o dia (ex.: Ir para hoje), a página começa no topo — não no horário atual.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [date]);

  // Posição do popover do calendário (portal no body: fica acima da grade / animação .reveal).
  useLayoutEffect(() => {
    if (!calOpen) return;
    const place = () => {
      const el = calBtn.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(Math.max(r.width, 280), window.innerWidth - 24);
      const left = Math.min(Math.max(12, r.left), window.innerWidth - width - 12);
      setCalBox({ top: r.bottom + 8, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [calOpen]);

  const byBarber = useMemo(() => {
    const map = new Map<string, AgendaEntry[]>();
    for (const e of entries) {
      // Cancelado já não vem da query; defesa extra se o cache ainda trouxer.
      if (e.kind === "appointment" && e.status === "cancelado") continue;
      (map.get(e.barberId) ?? map.set(e.barberId, []).get(e.barberId)!).push(e);
    }
    return map;
  }, [entries]);

  /** Faixas horizontais quando a recepção encaixa horários no mesmo profissional. */
  const lanesByBarber = useMemo(() => {
    const map = new Map<string, ReturnType<typeof overlapLanes>>();
    for (const [barberId, list] of byBarber) {
      map.set(barberId, overlapLanes(list));
    }
    return map;
  }, [byBarber]);

  // Preferência local: quais profissionais ocultar na grade (novos entram visíveis).
  useEffect(() => {
    setHiddenIds(readHidden(slug));
  }, [slug]);

  function setHidden(next: Set<string>) {
    setHiddenIds(next);
    writeHidden(slug, next);
  }

  /** @returns false se não deu para ocultar (precisa restar ao menos um). */
  function toggleBarber(id: string): boolean {
    const next = new Set(hiddenIds);
    if (next.has(id)) next.delete(id);
    else {
      if (visibleBarbers.length <= 1 && visibleBarbers[0]?.id === id) return false;
      next.add(id);
    }
    setHidden(next);
    return true;
  }

  function showAllBarbers() {
    setHidden(new Set());
  }

  const done = useCallback(
    (message: string, savedDate?: string) => {
      setDialog(null);
      setNotice(message);
      // Atualiza a grade (situação, horário, profissional) sem esperar o polling.
      if (savedDate && savedDate !== date) router.push(`/u/${slug}/agenda?data=${savedDate}`);
      else router.refresh();
    },
    [date, router, slug],
  );
  const refreshAgenda = useCallback(() => {
    router.refresh();
  }, [router]);
  const close = useCallback(() => setDialog(null), []);
  const openComanda = useCallback(
    (appointmentId: string) => {
      setDialog(null);
      startComanda(async () => {
        const r = await loadComandaAction(slug, appointmentId);
        if (!r.ok) setNotice(r.message);
        else setComanda(r);
      });
    },
    [slug],
  );
  const charged = useCallback(
    (message: string) => {
      setComanda(null);
      setNotice(message);
      router.refresh();
    },
    [router],
  );
  const savedComanda = useCallback(
    (message: string) => {
      setNotice(message);
      router.refresh();
    },
    [router],
  );
  const reopenedComanda = useCallback(
    (appointmentId: string | null, message: string) => {
      setNotice(message);
      router.refresh();
      if (!appointmentId) {
        setComanda(null);
        return;
      }
      startComanda(async () => {
        const r = await loadComandaAction(slug, appointmentId);
        if (r.ok) setComanda(r);
        else setComanda(null);
      });
    },
    [router, slug],
  );

  const openStatusMenu = useCallback((entry: AgendaEntry, e: React.MouseEvent) => {
    if (entry.kind !== "appointment") return;
    e.preventDefault();
    e.stopPropagation();
    const pad = 8;
    const menuW = 220;
    const menuH = 248;
    const x = Math.min(e.clientX, window.innerWidth - menuW - pad);
    const y = Math.min(e.clientY, window.innerHeight - menuH - pad);
    setConfirmCancel(false);
    setStatusMenu({ entryId: entry.id, x: Math.max(pad, x), y: Math.max(pad, y) });
  }, []);

  function closeStatusMenu() {
    setStatusMenu(null);
    setConfirmCancel(false);
  }

  function applyStatus(entryId: string, to: AppointmentStatus) {
    closeStatusMenu();
    startStatus(async () => {
      const r = await setAppointmentStatusAction(slug, entryId, to);
      if (r.status === "success") {
        setNotice(r.message ?? "Situação atualizada.");
        router.refresh();
      } else {
        setNotice(r.message ?? "Não foi possível mudar a situação.");
      }
    });
  }

  useEffect(() => {
    if (!statusMenu) return;
    const closeMenu = () => {
      setStatusMenu(null);
      setConfirmCancel(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [statusMenu]);

  const beginCardPointer = useCallback(
    (entry: AgendaEntry, e: React.PointerEvent<HTMLButtonElement>) => {
      if (entry.kind !== "appointment" || !DRAG_EDITABLE.has(entry.status) || moving) return;
      if (e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const next: DragState = {
        entry,
        width: rect.width,
        height: rect.height,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        originX: e.clientX,
        originY: e.clientY,
        x: rect.left,
        y: rect.top,
        active: false,
        target: null,
      };
      dragRef.current = next;
      setDrag(next);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [moving],
  );

  const updateCardPointer = useCallback(
    (e: React.PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const dist = Math.hypot(e.clientX - cur.originX, e.clientY - cur.originY);
      const active = cur.active || dist >= DRAG_THRESHOLD;
      const target = active ? resolveDropTarget(e.clientX, e.clientY) : null;
      const next: DragState = {
        ...cur,
        active,
        x: e.clientX - cur.grabX,
        y: e.clientY - cur.grabY,
        target,
      };
      dragRef.current = next;
      setDrag(next);
    },
    [resolveDropTarget],
  );

  const endCardPointer = useCallback(
    (e: React.PointerEvent, onOpen: () => void) => {
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!cur) return;

      if (!cur.active) {
        onOpen();
        return;
      }

      // Impede o click sintético no slot (ou no card) após soltar o arraste.
      swallowClickRef.current = true;
      const swallow = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        swallowClickRef.current = false;
        window.removeEventListener("click", swallow, true);
      };
      window.addEventListener("click", swallow, true);
      window.setTimeout(() => {
        window.removeEventListener("click", swallow, true);
        swallowClickRef.current = false;
      }, 400);

      const target = cur.target ?? resolveDropTarget(e.clientX, e.clientY);
      if (!target) return;
      const same =
        target.barberId === cur.entry.barberId && target.startMin === cur.entry.startMin;
      if (same) return;

      const time = fromMinutes(target.startMin);
      startMoving(async () => {
        const r = await moveAppointmentAction(slug, cur.entry.id, {
          barberId: target.barberId,
          date,
          time,
        });
        if (r.status === "success") {
          setNotice(r.message ?? "Agendamento movido.");
          router.refresh();
        } else {
          setNotice(r.message ?? "Não foi possível mover o agendamento.");
          // Horário tomado por outro agendamento: atualiza a grade.
          router.refresh();
        }
      });
    },
    [date, resolveDropTarget, router, slug],
  );

  const dayKey = dayKeyOf(date);
  function firstTime(barber: AgendaBarber | undefined) {
    const w = barber ? windowOf(barber.workHours, dayKey) : null;
    let t = w?.kind === "open" ? w.open : from;
    if (isToday && nowMin !== null) t = Math.max(t, roundUpTo(nowMin, slot));
    return fromMinutes(Math.min(Math.max(t, from), Math.max(from, to - slot)));
  }

  function openNew() {
    // Sem profissional/horário: o wizard pede cliente → serviços → profissional e horários livres.
    setDialog({ type: "appointment", target: { kind: "new", date } });
  }

  function openBlock() {
    const start = firstTime(visibleBarbers[0] ?? barbers[0]);
    const end = fromMinutes(Math.min(1439, toMinutes(start) + Math.max(slot, 60)));
    setDialog({ type: "block", target: { kind: "new", barberId: "all", date, start, end } });
  }

  // Colunas visíveis dividem a largura igualmente — sem scroll horizontal.
  const gridCols =
    visibleBarbers.length > 0
      ? `${AXIS} repeat(${visibleBarbers.length}, minmax(0, 1fr))`
      : AXIS;
  const nowTop = isToday && nowMin !== null && nowMin >= from && nowMin <= to ? px(nowMin) : null;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-3 overflow-x-clip lg:gap-4">
      {/* —— Celular: data centralizada, ações iguais, profissionais —— */}
      <div className="reveal flex flex-col gap-3 lg:hidden" style={{ "--d": "100ms" } as React.CSSProperties}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/u/${slug}/agenda?data=${addDays(date, -1)}`}
              aria-label="Dia anterior"
              onClick={() => setCalOpen(false)}
              className={buttonVariants({ variant: "outline", size: "icon-sm", className: "size-10 shrink-0" })}
            >
              <ChevronLeft />
            </Link>
            <button
              ref={calBtn}
              type="button"
              aria-expanded={calOpen}
              aria-haspopup="dialog"
              aria-label="Abrir calendário"
              onClick={() => setCalOpen((o) => !o)}
              className={cn(
                "flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 transition-colors",
                isToday
                  ? "border-gold/60 bg-gold/10 hover:border-gold"
                  : "border-border bg-surface hover:border-gold/50",
              )}
            >
              <CalendarDays className="size-4 shrink-0 text-gold" aria-hidden="true" />
              <span className="min-w-0 truncate text-center font-heading text-sm font-semibold capitalize tracking-wide">
                {longDateLabel(date)}
              </span>
              <ChevronDown
                className={cn("size-4 shrink-0 text-muted-foreground transition-transform", calOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            <Link
              href={`/u/${slug}/agenda?data=${addDays(date, 1)}`}
              aria-label="Próximo dia"
              onClick={() => setCalOpen(false)}
              className={buttonVariants({ variant: "outline", size: "icon-sm", className: "size-10 shrink-0" })}
            >
              <ChevronRight />
            </Link>
          </div>
          {!isToday ? (
            <div className="flex justify-center">
              <Link
                href={`/u/${slug}/agenda`}
                onClick={() => setCalOpen(false)}
                className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 px-4" })}
              >
                Ir para hoje
              </Link>
            </div>
          ) : null}
        </div>

        <BarberVisibilityFilter
          barbers={barbers}
          hiddenIds={hiddenIds}
          visibleCount={visibleBarbers.length}
          onToggle={toggleBarber}
          onShowAll={showAllBarbers}
          onOpenChange={(open) => {
            if (open) setCalOpen(false);
          }}
          className="w-full"
        />

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={openBlock} className="h-11 gap-2">
            <Lock />
            Bloquear
          </Button>
          <Button type="button" variant="luxe" size="sm" onClick={openNew} className="h-11 gap-2 text-[0.75rem]">
            <Plus />
            Agendar
          </Button>
        </div>
      </div>

      {/* —— Desktop: data + ações na mesma linha —— */}
      <div
        className="reveal hidden w-full min-w-0 items-center justify-between gap-3 lg:flex"
        style={{ "--d": "100ms" } as React.CSSProperties}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={`/u/${slug}/agenda`}
            aria-current={isToday ? "date" : undefined}
            className={buttonVariants({ variant: isToday ? "default" : "outline", size: "sm", className: "h-8 shrink-0 px-3" })}
          >
            Hoje
          </Link>
          <Link
            href={`/u/${slug}/agenda?data=${addDays(date, -1)}`}
            aria-label="Dia anterior"
            className={buttonVariants({ variant: "ghost", size: "icon-sm", className: "shrink-0" })}
          >
            <ChevronLeft />
          </Link>
          <Link
            href={`/u/${slug}/agenda?data=${addDays(date, 1)}`}
            aria-label="Próximo dia"
            className={buttonVariants({ variant: "ghost", size: "icon-sm", className: "shrink-0" })}
          >
            <ChevronRight />
          </Link>
          <p className="min-w-0 truncate font-heading text-base font-semibold uppercase tracking-wide">
            {capitalize(longDateLabel(date))}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <BarberVisibilityFilter
            barbers={barbers}
            hiddenIds={hiddenIds}
            visibleCount={visibleBarbers.length}
            onToggle={toggleBarber}
            onShowAll={showAllBarbers}
            onOpenChange={(open) => {
              if (open) setCalOpen(false);
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={openBlock} className="h-9 gap-1.5 px-3">
            <Lock />
            Bloquear
          </Button>
          <Button type="button" variant="luxe" size="sm" onClick={openNew} className="h-9 gap-1.5 px-3 text-[0.7rem]">
            <Plus />
            Agendar
          </Button>
        </div>
      </div>

      {/* Grade + calendário (lateral só no desktop) */}
      <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <div
          className="reveal relative w-full min-w-0 max-w-full flex-1 overflow-x-clip rounded-2xl border border-border bg-[#0c0c0c] shadow-[inset_0_1px_0_rgb(242_237_228/0.04)]"
          style={{ "--d": "180ms" } as React.CSSProperties}
          role="region"
          aria-label={`Agenda de ${longDateLabel(date)}`}
        >
          <div className="grid w-full" style={{ gridTemplateColumns: gridCols }}>
            <div className="sticky left-0 top-0 z-30 border-b border-border bg-[#121212]" />
            {visibleBarbers.map((b) => (
              <div
                key={b.id}
                className={cn(
                  "sticky top-0 z-20 flex flex-col items-center border-b border-l border-border bg-[#121212] text-center",
                  dense ? "gap-1 px-1 py-2" : "gap-1.5 px-3 py-3",
                )}
              >
                <BarberAvatar
                  name={b.name}
                  url={b.photoUrl}
                  className={dense ? "size-8 text-[0.65rem]" : "size-11 text-sm"}
                />
                <p
                  className={cn(
                    "min-w-0 w-full truncate font-heading font-semibold uppercase tracking-wide",
                    dense ? "text-[0.65rem] leading-tight" : "text-sm",
                  )}
                  title={b.name}
                >
                  {b.name}
                  {b.inactive ? (
                    <span className="font-sans font-normal normal-case text-muted-foreground"> (desativado)</span>
                  ) : null}
                </p>
              </div>
            ))}

            <div className="sticky left-0 z-10 border-r border-border bg-[#0e0e0e]" style={{ height }}>
              {Array.from({ length: rows }, (_, i) => {
                const min = from + i * slot;
                const hour = min % 60 === 0;
                const half = min % 30 === 0;
                return (
                  <span
                    key={min}
                    className={cn(
                      "absolute right-1.5 flex items-start justify-end tabular-nums leading-none",
                      hour
                        ? "text-[0.7rem] font-medium text-muted-foreground"
                        : half
                          ? "text-[0.65rem] text-muted-foreground/70"
                          : "text-[0.6rem] text-muted-foreground/45",
                    )}
                    style={{ top: i * ROW + 3, height: ROW - 4 }}
                  >
                    {fromMinutes(min)}
                  </span>
                );
              })}
              {nowTop !== null ? (
                <span
                  className="absolute right-1 z-10 -translate-y-1/2 rounded bg-gold px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums text-[#101010]"
                  style={{ top: nowTop }}
                >
                  {fromMinutes(nowMin!)}
                </span>
              ) : null}
            </div>

            {visibleBarbers.map((b) => {
              const spans = unavailableSpans({ unitHours, barberHours: b.workHours, date, from, to });
              const dropSpan =
                drag?.active && drag.target?.barberId === b.id
                  ? {
                      start: drag.target.startMin,
                      end: drag.target.startMin + Math.max(slot, drag.entry.endMin - drag.entry.startMin),
                    }
                  : null;
              return (
                <div
                  key={b.id}
                  data-agenda-col={b.id}
                  className={cn("relative min-w-0 border-l border-border/70", drag?.active && "select-none")}
                  style={{ height }}
                >
                  {spans.map((s) => (
                    <div
                      key={`${s.start}-${s.end}`}
                      data-unavailable
                      aria-hidden="true"
                      className={cn("pointer-events-none absolute inset-x-0 z-0", OFF_HOURS)}
                      style={{ top: px(s.start), height: px(s.end) - px(s.start) }}
                    />
                  ))}

                  {Array.from({ length: rows }, (_, i) => {
                    const min = from + i * slot;
                    return (
                      <button
                        key={min}
                        type="button"
                        aria-label={`Novo agendamento com ${b.name} às ${fromMinutes(min)}`}
                        onClick={() => {
                          if (drag?.active || swallowClickRef.current) return;
                          setDialog({
                            type: "appointment",
                            target: { kind: "new", barberId: b.id, date, time: fromMinutes(min) },
                          });
                        }}
                        className={cn(
                          "group/slot absolute inset-x-0 z-[1] cursor-pointer border-t outline-none transition-colors focus-visible:bg-gold/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50",
                          min % 60 === 0 ? "border-border/80" : "border-border/30",
                          !drag?.active && "hover:bg-gold/[0.06]",
                        )}
                        style={{ top: i * ROW, height: ROW }}
                      >
                        <span
                          className={cn(
                            "pointer-events-none absolute top-1/2 -translate-y-1/2 font-heading text-[0.65rem] font-semibold uppercase tracking-wide text-gold tabular-nums opacity-0 transition-opacity group-hover/slot:opacity-100 group-focus-visible/slot:opacity-100",
                            dense ? "left-1" : "left-2",
                          )}
                          aria-hidden="true"
                        >
                          {fromMinutes(min)}
                        </span>
                        <Plus
                          className={cn(
                            "pointer-events-none absolute top-1/2 size-3.5 -translate-y-1/2 text-gold/0 transition-colors group-hover/slot:text-gold/60 group-focus-visible/slot:text-gold/70",
                            dense ? "right-1" : "right-2",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}

                  {/* Preview do drop por cima de fora do expediente / bloqueios. */}
                  {dropSpan ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0.5 z-[6] rounded-md bg-gold/30 ring-2 ring-inset ring-gold/70"
                      style={{ top: px(dropSpan.start) + 1, height: Math.max(px(dropSpan.end) - px(dropSpan.start) - 2, ROW - 2) }}
                    />
                  ) : null}

                  {(byBarber.get(b.id) ?? []).map((e) => {
                    const open = () =>
                      setDialog(
                        e.kind === "block"
                          ? { type: "block", target: { kind: "view", entry: e } }
                          : { type: "appointment", target: { kind: "edit", entry: e } },
                      );
                    const lane = lanesByBarber.get(b.id)?.get(e.id) ?? { lane: 0, lanes: 1 };
                    return (
                      <EntryCard
                        key={e.id}
                        entry={e}
                        dense={dense}
                        top={px(Math.max(e.startMin, from))}
                        height={px(Math.min(e.endMin, to)) - px(Math.max(e.startMin, from))}
                        lane={lane.lane}
                        lanes={lane.lanes}
                        dragging={drag?.active && drag.entry.id === e.id}
                        dragActive={!!drag?.active}
                        canDrag={e.kind === "appointment" && DRAG_EDITABLE.has(e.status) && !moving}
                        onOpen={open}
                        onStatusMenu={e.kind === "appointment" ? (ev) => openStatusMenu(e, ev) : undefined}
                        onPointerBegin={(ev) => beginCardPointer(e, ev)}
                        onPointerDrag={updateCardPointer}
                        onPointerEnd={(ev) => endCardPointer(ev, open)}
                        onPointerCancel={() => {
                          dragRef.current = null;
                          setDrag(null);
                        }}
                      />
                    );
                  })}

                  {nowTop !== null ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 h-px bg-gold shadow-[0_0_8px_rgb(192_160_98/0.8)]"
                      style={{ top: nowTop }}
                    >
                      <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-gold" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <aside
          className="reveal hidden w-[17.5rem] shrink-0 flex-col gap-3 lg:flex"
          style={{ "--d": "220ms" } as React.CSSProperties}
        >
          <MiniCalendar slug={slug} date={date} today={today} />
          <div className="rounded-2xl border border-border bg-[#141414] px-4 py-3 text-xs text-muted-foreground">
            <p className="label-caps mb-2 text-[0.6rem] text-gold">Legenda</p>
            <ul className="flex flex-col gap-2">
              {QUICK_STATUSES.map((s) => (
                <li key={s.value} className="flex items-center gap-2">
                  <span
                    className={cn("h-3 w-1.5 shrink-0 rounded-full", statusRailClass(s.value))}
                    aria-hidden="true"
                  />
                  {s.label}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span className={cn("h-3 w-5 rounded-sm border border-sky-400/30", OFF_HOURS)} aria-hidden="true" />
                Fora do expediente
              </li>
              <li className="flex items-center gap-2">
                <span className={cn("h-3 w-5 rounded-sm", BLOCK_LOOK)} aria-hidden="true" />
                Bloqueio
              </li>
              <li className="mt-1 border-t border-border/50 pt-2 text-[0.65rem] leading-snug text-muted-foreground/80">
                Clique direito no card para mudar a situação.
              </li>
            </ul>
          </div>
        </aside>
      </div>

      {calOpen && calBox
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Fechar calendário"
                className="fixed inset-0 z-[70] cursor-default bg-black/55"
                onClick={() => setCalOpen(false)}
              />
              <div
                role="dialog"
                aria-label="Escolher data"
                className="fixed z-[71] shadow-[0_24px_60px_-12px_rgb(0_0_0/0.9)]"
                style={{ top: calBox.top, left: calBox.left, width: calBox.width }}
              >
                <MiniCalendar slug={slug} date={date} today={today} onDaySelect={() => setCalOpen(false)} />
              </div>
            </>,
            document.body,
          )
        : null}

      {dialog?.type === "appointment" ? (
        <AppointmentDialog
          key={
            dialog.target.kind === "edit"
              ? dialog.target.entry.id
              : `new-${dialog.target.barberId ?? "any"}-${dialog.target.time ?? "pick"}`
          }
          slug={slug}
          target={dialog.target}
          barbers={barbers}
          services={services}
          offers={offers}
          popularIds={popularIds}
          entries={entries}
          unitHours={unitHours}
          slot={slot}
          from={from}
          to={to}
          today={today}
          onClose={close}
          onDone={done}
          onRefresh={refreshAgenda}
          onCharge={openComanda}
        />
      ) : null}
      {openingComanda ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <p className="rounded-xl border border-gold/30 bg-[#1a1a1a] px-5 py-4 text-sm text-cream">Abrindo comanda…</p>
        </div>
      ) : null}
      {comanda ? (
        <ComandaDialog
          slug={slug}
          ticket={comanda.ticket}
          services={comanda.services}
          products={comanda.products}
          barbers={comanda.barbers}
          registerOpen={comanda.registerOpen}
          registerDay={comanda.registerDay}
          packages={comanda.packages}
          salePackages={comanda.salePackages}
          onClose={() => setComanda(null)}
          onCharged={charged}
          onSaved={savedComanda}
          onReopened={(message) => reopenedComanda(comanda.ticket.appointmentId, message)}
        />
      ) : null}
      {dialog?.type === "block" ? (
        <BlockDialog
          key={dialog.target.kind === "view" ? dialog.target.entry.id : "new"}
          slug={slug}
          target={dialog.target}
          barbers={barbers}
          slot={slot}
          today={today}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {drag?.active
        ? createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[70] overflow-hidden rounded-md border border-gold/50 bg-[#221e16] shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)] ring-1 ring-gold/30"
              style={{
                left: drag.x,
                top: drag.y,
                width: drag.width,
                height: drag.height,
                opacity: 0.92,
                transform: "scale(1.02)",
              }}
            >
              <div className="flex h-full">
                <span className="w-1 shrink-0 self-stretch bg-gold" />
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2 py-1">
                  <span className="text-[0.65rem] font-medium tabular-nums text-gold">
                    {drag.target ? fromMinutes(drag.target.startMin) : drag.entry.time}
                    {drag.target ? ` →` : ""}
                  </span>
                  <span className="truncate text-[0.78rem] font-semibold text-cream">{drag.entry.customerName}</span>
                </span>
              </div>
            </div>,
            document.body,
          )
        : null}

      {moving || statusPending ? (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[75] flex justify-center">
          <p className="rounded-full border border-gold/40 bg-[#141414]/95 px-3 py-1.5 text-xs text-gold shadow-lg">
            {moving ? "Salvando horário…" : "Atualizando situação…"}
          </p>
        </div>
      ) : null}

      {statusMenu
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Fechar menu de situação"
                className="fixed inset-0 z-[80] cursor-default bg-transparent"
                onClick={closeStatusMenu}
                onContextMenu={(e) => {
                  e.preventDefault();
                  closeStatusMenu();
                }}
              />
              <div
                role="menu"
                aria-label="Situação do agendamento"
                className="fixed z-[81] w-[13.75rem] overflow-hidden rounded-xl border border-gold/30 bg-[#141414] py-1.5 shadow-[0_20px_50px_-16px_rgb(0_0_0/0.9)]"
                style={{ left: statusMenu.x, top: statusMenu.y }}
              >
                {confirmCancel ? (
                  <div className="px-3 py-2" role="alertdialog" aria-label="Confirmar cancelamento">
                    <p className="text-sm font-medium text-cream">Cancelar este agendamento?</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {entries.find((x) => x.id === statusMenu.entryId)?.customerName ?? "Cliente"} ·{" "}
                      {entries.find((x) => x.id === statusMenu.entryId)?.time} — o horário será liberado e o
                      agendamento sai da agenda.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={statusPending}
                        onClick={() => applyStatus(statusMenu.entryId, "cancelado")}
                        className="h-8 flex-1 cursor-pointer rounded-lg bg-destructive px-2 text-xs font-semibold text-white transition-colors hover:bg-destructive/85 disabled:opacity-50"
                      >
                        {statusPending ? "Cancelando…" : "Sim, cancelar"}
                      </button>
                      <button
                        type="button"
                        disabled={statusPending}
                        onClick={() => setConfirmCancel(false)}
                        className="h-8 flex-1 cursor-pointer rounded-lg border border-border px-2 text-xs text-cream transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-50"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="label-caps px-3 pb-1.5 pt-1 text-[0.55rem] text-muted-foreground">Situação</p>
                    {QUICK_STATUSES.map((s) => {
                      const entry = entries.find((x) => x.id === statusMenu.entryId);
                      const current = entry?.status === s.value;
                      const danger = s.value === "cancelado";
                      return (
                        <button
                          key={s.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={current}
                          disabled={statusPending || current}
                          onClick={() => (danger ? setConfirmCancel(true) : applyStatus(statusMenu.entryId, s.value))}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:cursor-default",
                        current
                          ? "bg-gold/10 text-gold"
                          : danger
                            ? "text-destructive/90 hover:bg-destructive/10"
                            : "text-cream hover:bg-gold/10 hover:text-gold",
                        statusPending && "opacity-50",
                      )}
                    >
                          <span className={cn("h-3 w-1.5 shrink-0 rounded-full", statusRailClass(s.value))} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{s.label}</span>
                          {current ? <Check className="size-3.5 shrink-0 text-gold" aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </>,
            document.body,
          )
        : null}

      {notice ? <Notice title={notice} onClose={() => setNotice(null)} /> : null}
    </div>
  );
}

type FilterBox = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

function filterBoxFor(el: HTMLElement): FilterBox | null {
  // Botão em toolbar oculta (display:none) não deve abrir painel.
  if (el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  const gap = 8;
  const width = Math.min(340, window.innerWidth - 24);
  const left = Math.min(Math.max(12, r.right - width), window.innerWidth - width - 12);
  const spaceBelow = window.innerHeight - r.bottom - gap - 12;
  const spaceAbove = r.top - gap - 12;
  const below = spaceBelow >= 220 || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(160, Math.min(380, below ? spaceBelow : spaceAbove));
  if (below) return { top: r.bottom + gap, left, width, maxHeight };
  return { bottom: window.innerHeight - r.top + gap, left, width, maxHeight };
}

function BarberVisibilityFilter({
  barbers,
  hiddenIds,
  visibleCount,
  onToggle,
  onShowAll,
  onOpenChange,
  className,
}: {
  barbers: AgendaBarber[];
  hiddenIds: Set<string>;
  visibleCount: number;
  onToggle: (id: string) => boolean;
  onShowAll: () => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<FilterBox | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const filtered = visibleCount < barbers.length;
  const allOn = visibleCount === barbers.length;

  const close = useCallback(() => {
    setOpen(false);
    setBox(null);
    setHint(null);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const place = useCallback(() => {
    const el = btn.current;
    if (!el) return;
    const next = filterBoxFor(el);
    if (!next) {
      close();
      return;
    }
    setBox(next);
  }, [close]);

  const openMenu = useCallback(() => {
    const el = btn.current;
    if (!el) return;
    const next = filterBoxFor(el);
    if (!next) return;
    setHint(null);
    setBox(next);
    setOpen(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        btn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  function handleToggle(id: string) {
    const ok = onToggle(id);
    if (!ok) {
      setHint("Mantenha pelo menos um profissional na agenda.");
      return;
    }
    setHint(null);
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) close();
          else openMenu();
        }}
        className={cn(
          "inline-flex h-10 cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 text-left transition-colors",
          "border-border bg-surface hover:border-gold/50",
          open && "border-gold/55 bg-gold/10",
          filtered && !open && "border-gold/35",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Users className="size-4 shrink-0 text-gold" aria-hidden="true" />
          <span className="truncate font-label text-[0.7rem] font-medium uppercase tracking-[0.16em]">
            Profissionais
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 font-label text-[0.65rem] tabular-nums tracking-wide",
              filtered ? "bg-gold/15 text-gold" : "bg-white/[0.06] text-muted-foreground",
            )}
          >
            {visibleCount}/{barbers.length}
          </span>
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && box
        ? createPortal(
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-label="Fechar filtro de profissionais"
                className="fixed inset-0 z-[70] cursor-default bg-black/45"
                onClick={close}
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Profissionais na agenda"
                tabIndex={-1}
                className="fixed z-[71] flex flex-col overflow-hidden rounded-2xl border border-border bg-[#121212] shadow-[0_28px_70px_-16px_rgb(0_0_0/0.92),inset_0_1px_0_rgb(242_237_228/0.06)] outline-none"
                style={{
                  left: box.left,
                  width: box.width,
                  maxHeight: box.maxHeight,
                  top: box.top,
                  bottom: box.bottom,
                }}
              >
                <header className="shrink-0 border-b border-border/70 px-4 pb-3 pt-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-heading text-sm font-semibold uppercase tracking-wide">Profissionais</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Quem aparece nas colunas da agenda</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border/80 bg-white/[0.03] px-2.5 py-1 font-label text-[0.65rem] tabular-nums text-muted-foreground">
                      {visibleCount} de {barbers.length}
                    </span>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        onShowAll();
                        setHint(null);
                      }}
                      disabled={allOn}
                      className={cn(
                        "h-8 w-full cursor-pointer rounded-lg border text-[0.7rem] font-medium uppercase tracking-wide transition-colors",
                        allOn
                          ? "cursor-default border-gold/40 bg-gold/15 text-gold"
                          : "border-border text-muted-foreground hover:border-gold/40 hover:text-foreground",
                      )}
                    >
                      Mostrar todos
                    </button>
                  </div>
                </header>

                <ul
                  className="scroll-luxe min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2"
                  style={{ maxHeight: Math.max(120, box.maxHeight - 150) }}
                >
                  {barbers.map((b) => {
                    const on = !hiddenIds.has(b.id);
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => handleToggle(b.id)}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                            on ? "bg-gold/[0.08] hover:bg-gold/[0.12]" : "opacity-70 hover:bg-white/[0.04] hover:opacity-100",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                              on ? "border-gold bg-gold text-[#101010]" : "border-border/80 bg-[#0c0c0c]",
                            )}
                          >
                            {on ? <Check className="size-3.5 stroke-[2.5]" /> : null}
                          </span>
                          <BarberAvatar name={b.name} url={b.photoUrl} className="size-8 text-[0.65rem]" />
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm font-medium",
                              on ? "text-foreground" : "text-muted-foreground",
                            )}
                          >
                            {b.name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <footer className="shrink-0 border-t border-border/70 px-4 py-2.5">
                  {hint ? (
                    <p className="text-xs text-gold" role="status">
                      {hint}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {filtered
                        ? `${barbers.length - visibleCount} oculto${barbers.length - visibleCount === 1 ? "" : "s"} nesta visualização`
                        : "Todos os profissionais estão visíveis"}
                    </p>
                  )}
                </footer>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

/** Card do horário na grade: faixa lateral colorida + horário, cliente e serviço. */
function EntryCard({
  entry,
  top,
  height,
  dense,
  lane = 0,
  lanes = 1,
  canDrag,
  dragging,
  dragActive,
  onOpen,
  onStatusMenu,
  onPointerBegin,
  onPointerDrag,
  onPointerEnd,
  onPointerCancel,
}: {
  entry: AgendaEntry;
  top: number;
  height: number;
  dense?: boolean;
  lane?: number;
  lanes?: number;
  canDrag?: boolean;
  dragging?: boolean;
  /** Algum card está sendo arrastado — os outros não capturam o ponteiro. */
  dragActive?: boolean;
  onOpen: () => void;
  onStatusMenu?: (e: React.MouseEvent) => void;
  onPointerBegin: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerDrag: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerEnd: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: () => void;
}) {
  const block = entry.kind === "block";
  const inactive = !block && !occupiesSlot(entry.status);
  const noPref = !block && entry.hasBarberPreference === false;
  const total = entry.services.reduce((n, s) => n + s.priceCents, 0);
  const tipServices = entry.services.map((s) => s.name).join(" · ");
  const firstService = entry.services[0]?.name ?? "";
  const extraServices = Math.max(0, entry.services.length - 1);
  const h = Math.max(height - 2, 20);
  const narrow = lanes > 1;
  // Quantas linhas cabem de verdade (evita cortar texto no meio).
  const linePx = dense || narrow ? 12 : 14;
  const padPx = dense || narrow ? 4 : 6;
  const maxLines = Math.max(1, Math.floor((h - padPx * 2) / linePx));
  const timeRange = `${entry.time} – ${entry.endTime}`;
  const label = block
    ? `Bloqueio ${entry.time} às ${entry.endTime}${entry.notes ? `: ${entry.notes}` : ""}`
    : `Agendamento ${entry.time} às ${entry.endTime}, ${entry.customerName}, ${statusLabel(entry.status)}`;

  const [tipBox, setTipBox] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const tipTimer = useRef<number | null>(null);

  // Hover com intenção: o detalhe só abre se o mouse ficar sobre o card.
  function hideTip() {
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    tipTimer.current = null;
    setTipBox(null);
  }

  function planTip() {
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(showTip, 400);
  }

  useEffect(
    () => () => {
      if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    },
    [],
  );

  function showTip() {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const tipW = 260;
    const tipH = block ? 88 : 128;
    let left = r.right + 10;
    if (left + tipW > window.innerWidth - 12) left = Math.max(12, r.left - tipW - 10);
    let top = r.top;
    if (top + tipH > window.innerHeight - 12) top = Math.max(12, window.innerHeight - tipH - 12);
    setTipBox({ left, top });
  }

  return (
    <>
      <button
        ref={cardRef}
        type="button"
        data-agenda-card
        aria-label={label}
        onMouseEnter={() => {
          if (!dragging) planTip();
        }}
        onMouseLeave={hideTip}
        onFocus={(e) => {
          // Mouse clicando também foca o botão: detalhe no foco só pelo teclado.
          if (e.currentTarget.matches(":focus-visible")) showTip();
        }}
        onBlur={hideTip}
        onContextMenu={(e) => {
          if (!onStatusMenu) return;
          hideTip();
          onStatusMenu(e);
        }}
        onPointerDown={
          canDrag
            ? (e) => {
                hideTip();
                onPointerBegin(e);
              }
            : hideTip
        }
        onPointerMove={canDrag ? onPointerDrag : undefined}
        onPointerUp={canDrag ? onPointerEnd : undefined}
        onPointerCancel={canDrag ? onPointerCancel : undefined}
        onClick={
          canDrag
            ? undefined
            : () => {
                hideTip();
                onOpen();
              }
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className={cn(
          "absolute flex overflow-hidden rounded-md text-left outline-none transition-[transform,box-shadow,opacity] hover:z-[3] hover:shadow-[0_6px_20px_-8px_rgb(0_0_0/0.7)] focus-visible:ring-2 focus-visible:ring-gold",
          canDrag ? "cursor-grab active:cursor-grabbing touch-none" : "cursor-pointer",
          block ? BLOCK_LOOK : cn("shadow-sm", statusCardClass(entry.status)),
          inactive ? "z-[1] opacity-75" : "z-[2]",
          dragging && "z-[4] opacity-30",
          // Durante o arraste, só o card capturado recebe eventos — os outros não cobrem o alvo.
          dragActive && !dragging && "pointer-events-none",
        )}
        style={{
          top: top + 1,
          height: h,
          // Encaixe: divide a coluna entre os que colidem; sozinho usa a largura toda.
          left: `calc(${(lane / lanes) * 100}% + ${dense ? 2 : 4}px)`,
          width: `calc(${(1 / lanes) * 100}% - ${dense ? 4 : 8}px)`,
        }}
      >
        {noPref ? (
          <span aria-hidden="true" className={cn("pointer-events-none absolute inset-0 rounded-[inherit]", PREF_STRIPES)} />
        ) : null}
        {!block ? (
          <span aria-hidden="true" className={cn("relative z-[1] w-1 shrink-0 self-stretch", statusRailClass(entry.status))} />
        ) : null}
        <span
          className={cn(
            "relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col justify-center overflow-hidden",
            dense || narrow ? "gap-px px-1 py-0.5" : "gap-0.5 px-1.5 py-1",
          )}
        >
          {block ? (
            <span className="flex min-w-0 items-center gap-1">
              <Lock className="size-3 shrink-0 text-gold/80" aria-hidden="true" />
              <span className="min-w-0 truncate text-[0.7rem] leading-none">{entry.notes ?? "Bloqueado"}</span>
            </span>
          ) : maxLines === 1 ? (
            <span
              className={cn(
                "flex min-w-0 items-center gap-1 leading-none",
                inactive && "opacity-80",
              )}
            >
              <span className="min-w-0 truncate text-[0.58rem] font-medium tabular-nums text-gold">{timeRange}</span>
              <span className="shrink-0 text-muted-foreground/50" aria-hidden="true">
                ·
              </span>
              <span
                className={cn(
                  "min-w-0 truncate text-[0.7rem] font-semibold text-cream",
                  inactive && "line-through",
                )}
              >
                {entry.customerName}
              </span>
            </span>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-1 leading-none">
                <span
                  className={cn(
                    "min-w-0 truncate whitespace-nowrap font-medium tabular-nums text-gold",
                    dense || narrow ? "text-[0.6rem]" : "text-[0.65rem]",
                  )}
                >
                  {timeRange}
                </span>
                {inactive ? (
                  <span className="label-caps ml-auto shrink-0 text-[0.5rem] text-muted-foreground">
                    {statusLabel(entry.status)}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "min-w-0 truncate font-semibold leading-none text-cream",
                  dense || narrow ? "text-[0.7rem]" : "text-[0.78rem]",
                  inactive && "line-through decoration-muted-foreground/60",
                )}
              >
                {entry.customerName}
              </span>
              {maxLines >= 3 && firstService ? (
                <span className="min-w-0 truncate text-[0.62rem] leading-none text-muted-foreground">
                  {firstService}
                  {extraServices > 0 ? ` +${extraServices}` : ""}
                </span>
              ) : null}
            </>
          )}
        </span>
      </button>
      {tipBox && !dragging
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[55] w-[16.25rem] overflow-hidden rounded-xl border border-gold/30 bg-[#141414] shadow-[0_20px_50px_-16px_rgb(0_0_0/0.9),0_0_0_1px_rgb(192_160_98/0.08)]"
              style={{ left: tipBox.left, top: tipBox.top }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-gradient-to-r from-gold/[0.12] to-transparent px-3.5 py-2.5">
                <span className="font-heading text-[0.7rem] font-semibold uppercase tracking-wide text-gold tabular-nums">
                  {entry.time} – {entry.endTime}
                </span>
                {!block ? (
                  <span className="label-caps rounded-md border border-border/80 bg-[#0e0e0e]/80 px-1.5 py-0.5 text-[0.55rem] text-muted-foreground">
                    {statusLabel(entry.status)}
                  </span>
                ) : (
                  <span className="label-caps rounded-md border border-border/80 bg-[#0e0e0e]/80 px-1.5 py-0.5 text-[0.55rem] text-muted-foreground">
                    Bloqueio
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2.5 px-3.5 py-3">
                {block ? (
                  <p className="flex items-start gap-2 text-sm text-cream">
                    <Lock className="mt-0.5 size-3.5 shrink-0 text-gold/80" aria-hidden="true" />
                    <span>{entry.notes?.trim() || "Horário bloqueado"}</span>
                  </p>
                ) : (
                  <>
                    <div>
                      <p className="label-caps text-[0.55rem] text-muted-foreground">Cliente</p>
                      <p className="mt-0.5 truncate text-sm font-semibold text-cream">{entry.customerName}</p>
                    </div>
                    {tipServices ? (
                      <div>
                        <p className="label-caps text-[0.55rem] text-muted-foreground">Serviços</p>
                        <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{tipServices}</p>
                      </div>
                    ) : null}
                    <div className="flex items-end justify-between gap-2 border-t border-border/60 pt-2.5">
                      <span className="text-[0.65rem] text-muted-foreground">
                        {noPref ? "Sem preferência" : "Com preferência"}
                      </span>
                      {total > 0 ? (
                        <span className="font-heading text-base font-semibold tabular-nums text-gold">{formatBRL(total)}</span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}


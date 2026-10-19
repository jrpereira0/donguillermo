import { DAYS, type DayHours, type DayKey, type OpeningHours } from "@/lib/validation/unit";

/**
 * Fuso das unidades. A rede é toda no ABC paulista, então a agenda usa um fuso só.
 * O banco guarda os instantes em UTC (timestamptz); aqui convertemos de/para o horário local
 * sem depender do fuso do servidor ou do navegador.
 */
export const AGENDA_TZ = "America/Sao_Paulo";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isIsoDate(v: string | null | undefined): v is string {
  if (!v) return false;
  const m = ISO_DATE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export const isHHMM = (v: string) => HHMM.test(v);

/** "09:30" -> 570. */
export function toMinutes(hhmm: string): number {
  const m = HHMM.exec(hhmm);
  if (!m) return NaN;
  return +m[1] * 60 + +m[2];
}

/** 570 -> "09:30". Aceita 1440 ("24:00") só para fim de dia. */
export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Soma `n` dias a uma data "YYYY-MM-DD". */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Dia da semana ("mon"...) de uma data "YYYY-MM-DD". */
export function dayKeyOf(iso: string): DayKey {
  const [y, m, d] = iso.split("-").map(Number);
  return DAY_KEYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export const dayLabel = (key: DayKey) => DAYS.find((d) => d.key === key)?.label ?? key;

function partsIn(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
}

/** Diferença (em minutos) entre o horário local em `tz` e o UTC naquele instante. */
function offsetMinutes(utc: Date, tz: string): number {
  const p = partsIn(utc, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utc.getTime() / 1000) * 1000) / 60000);
}

/** Data "YYYY-MM-DD" + hora "HH:MM" locais -> instante UTC. */
export function zonedToUtc(date: string, time: string, tz: string = AGENDA_TZ): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const min = time === "24:00" ? 1440 : toMinutes(time);
  const guess = Date.UTC(y, mo - 1, d, 0, min);
  const off1 = offsetMinutes(new Date(guess), tz);
  let t = guess - off1 * 60000;
  const off2 = offsetMinutes(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t);
}

/** Instante UTC -> data e hora locais. */
export function utcToZoned(
  input: Date | string,
  tz: string = AGENDA_TZ,
): { date: string; time: string; minutes: number } {
  const p = partsIn(typeof input === "string" ? new Date(input) : input, tz);
  const date = `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const minutes = p.hour * 60 + p.minute;
  return { date, time: fromMinutes(minutes), minutes };
}

/** Hoje (data local) no fuso da agenda. */
export function todayIso(now: Date = new Date(), tz: string = AGENDA_TZ): string {
  return utcToZoned(now, tz).date;
}

/** Início (00:00) do dia local e início do dia seguinte, em UTC. */
export function dayBoundsUtc(date: string, tz: string = AGENDA_TZ): { start: Date; end: Date } {
  return { start: zonedToUtc(date, "00:00", tz), end: zonedToUtc(addDays(date, 1), "00:00", tz) };
}

/** Arredonda `n` para cima até o próximo múltiplo de `step`. */
export function roundUpTo(n: number, step: number): number {
  return Math.ceil(n / step) * step;
}

// ---------------- Expediente ----------------

export type DayWindow =
  | { kind: "closed" }
  | { kind: "unset" }
  | { kind: "open"; open: number; close: number; breakStart: number | null; breakEnd: number | null };

/**
 * Janela de funcionamento do dia, em minutos desde 00:00.
 * `unset` = dia não informado (sem restrição); `closed` = fechado / folga.
 */
export function windowOf(hours: unknown, key: DayKey): DayWindow {
  const src = (hours && typeof hours === "object" ? hours : {}) as OpeningHours;
  const d: DayHours | undefined = src[key];
  if (!d) return { kind: "unset" };
  if ("closed" in d) return { kind: "closed" };
  return {
    kind: "open",
    open: toMinutes(d.open),
    close: toMinutes(d.close),
    breakStart: d.break ? toMinutes(d.break.start) : null,
    breakEnd: d.break ? toMinutes(d.break.end) : null,
  };
}

/**
 * Confere se o intervalo [start, end) (minutos do dia) cabe no funcionamento da unidade e no
 * expediente do profissional. Devolve o motivo da primeira restrição que ele fere, ou null.
 * Dia não informado não restringe; o profissional sem horário próprio segue o da unidade.
 */
export function outsideHoursReason(opts: {
  unitHours: unknown;
  barberHours: unknown;
  date: string;
  start: number;
  end: number;
}): string | null {
  const key = dayKeyOf(opts.date);

  const unit = windowOf(opts.unitHours, key);
  if (unit.kind === "closed") return `A unidade fecha em ${dayLabel(key).toLowerCase()}.`;
  if (unit.kind === "open" && (opts.start < unit.open || opts.end > unit.close)) {
    return `Fora do horário da unidade (${fromMinutes(unit.open)} às ${fromMinutes(unit.close)}).`;
  }

  const barber = windowOf(opts.barberHours, key);
  if (barber.kind === "closed") return "O profissional não trabalha neste dia.";
  if (barber.kind === "open") {
    if (opts.start < barber.open || opts.end > barber.close) {
      return `Fora do expediente do profissional (${fromMinutes(barber.open)} às ${fromMinutes(barber.close)}).`;
    }
    if (barber.breakStart !== null && barber.breakEnd !== null && opts.start < barber.breakEnd && opts.end > barber.breakStart) {
      return `Dentro do intervalo do profissional (${fromMinutes(barber.breakStart)} às ${fromMinutes(barber.breakEnd)}).`;
    }
  }
  return null;
}

/**
 * Trechos do dia (em minutos) em que o profissional NÃO atende, dentro de [from, to]:
 * antes/depois do expediente, intervalo, ou o dia todo se for folga/unidade fechada.
 */
export function unavailableSpans(opts: {
  unitHours: unknown;
  barberHours: unknown;
  date: string;
  from: number;
  to: number;
}): { start: number; end: number }[] {
  const key = dayKeyOf(opts.date);
  const unit = windowOf(opts.unitHours, key);
  const barber = windowOf(opts.barberHours, key);
  const all = [{ start: opts.from, end: opts.to }];
  if (unit.kind === "closed" || barber.kind === "closed") return all;

  let open = opts.from;
  let close = opts.to;
  if (unit.kind === "open") {
    open = Math.max(open, unit.open);
    close = Math.min(close, unit.close);
  }
  if (barber.kind === "open") {
    open = Math.max(open, barber.open);
    close = Math.min(close, barber.close);
  }
  if (close <= open) return all;

  const out: { start: number; end: number }[] = [];
  if (open > opts.from) out.push({ start: opts.from, end: open });
  if (barber.kind === "open" && barber.breakStart !== null && barber.breakEnd !== null) {
    const s = Math.max(barber.breakStart, open);
    const e = Math.min(barber.breakEnd, close);
    if (e > s) out.push({ start: s, end: e });
  }
  if (close < opts.to) out.push({ start: close, end: opts.to });
  return out;
}

/**
 * Horários de início livres para um profissional no dia: alinhados ao passo da agenda
 * e sem sobrepor `busy`. Por padrão respeita o expediente; com `allowOutside` a recepção
 * vê também horários fora (encaixe — exige confirmação no formulário).
 */
export function freeSlots(opts: {
  unitHours: unknown;
  barberHours: unknown;
  date: string;
  slot: number;
  /** Duração ocupada na grade (já arredondada ao passo). */
  durationMin: number;
  busy: { start: number; end: number }[];
  from: number;
  to: number;
  /** Inclui horários fora do expediente / intervalo (recepção). */
  allowOutside?: boolean;
  /**
   * Recepção: permite encaixe (horário já ocupado aparece na lista).
   * Cliente no navegador: deixar falso — só vê slots livres.
   */
  allowOverlap?: boolean;
}): string[] {
  const dur = Math.max(opts.slot, opts.durationMin);
  if (dur <= 0 || opts.slot <= 0) return [];
  const out: string[] = [];
  for (let t = opts.from; t + dur <= opts.to; t += opts.slot) {
    if (!opts.allowOutside) {
      if (
        outsideHoursReason({
          unitHours: opts.unitHours,
          barberHours: opts.barberHours,
          date: opts.date,
          start: t,
          end: t + dur,
        })
      ) {
        continue;
      }
    }
    if (!opts.allowOverlap && opts.busy.some((b) => t < b.end && t + dur > b.start)) continue;
    out.push(fromMinutes(t));
  }
  return out;
}

/**
 * Faixa de horas exibida na grade: do menor início ao maior fim entre as janelas conhecidas
 * (unidade e profissionais) no dia, arredondada para horas cheias. Sem horários, 08:00–20:00.
 * `extra` amplia a faixa (ex.: agendamentos fora do expediente).
 */
export function gridRange(opts: {
  unitHours: unknown;
  barbersHours: unknown[];
  date: string;
  extra?: { start: number; end: number }[];
}): { from: number; to: number } {
  const key = dayKeyOf(opts.date);
  let from = Infinity;
  let to = -Infinity;
  const take = (w: DayWindow) => {
    if (w.kind === "open") {
      from = Math.min(from, w.open);
      to = Math.max(to, w.close);
    }
  };
  take(windowOf(opts.unitHours, key));
  for (const h of opts.barbersHours) take(windowOf(h, key));
  for (const e of opts.extra ?? []) {
    from = Math.min(from, e.start);
    to = Math.max(to, e.end);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { from: 8 * 60, to: 20 * 60 };
  return { from: Math.max(0, Math.floor(from / 60) * 60), to: Math.min(1440, Math.ceil(to / 60) * 60) };
}

/** "terça-feira, 14 de outubro" a partir de "YYYY-MM-DD". */
export function longDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** "14/10/2026" a partir de "YYYY-MM-DD". */
export function shortDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "qua., 28 de out." — rótulo curto para a toolbar do celular. */
export function compactDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Posição horizontal quando horários se sobrepõem na mesma coluna. */
export type OverlapLane = { lane: number; lanes: number };

/**
 * Divide a coluna entre itens que colidem no tempo (estilo calendário).
 * Itens sem sobreposição ficam com lane 0 e lanes 1 (largura total).
 */
export function overlapLanes<T extends { id: string; startMin: number; endMin: number }>(
  items: T[],
): Map<string, OverlapLane> {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.id.localeCompare(b.id),
  );
  const out = new Map<string, OverlapLane>();

  type Placed = { id: string; end: number; lane: number };
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const p of cluster) out.set(p.id, { lane: p.lane, lanes });
    cluster = [];
    clusterEnd = -1;
    laneEnds = [];
  };

  for (const item of sorted) {
    if (cluster.length > 0 && item.startMin >= clusterEnd) flush();

    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    cluster.push({ id: item.id, end: item.endMin, lane });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (cluster.length) flush();
  return out;
}

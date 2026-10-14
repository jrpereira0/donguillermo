"use client";

import { useState } from "react";
import { CalendarDays, Clock, Coffee, Copy, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { DAYS, hoursToFormDefaults, type DayFormDefaults, type DayKey } from "@/lib/validation/unit";

type Props = {
  /** JSON salvo em units.opening_hours / barbers.work_hours (ou null). */
  defaultValue?: unknown;
  errors?: Record<string, string | undefined>;
  /** Título do grupo (padrão: horário de funcionamento da unidade). */
  legend?: string;
  /** Texto de apoio abaixo do título. */
  hint?: string;
  /** Rótulo do interruptor que marca o dia sem expediente. */
  closedLabel?: string;
  /** Mostra os campos de almoço (intervalo) em cada dia. */
  withBreak?: boolean;
  /** Rótulo do intervalo (padrão: Almoço). */
  breakLabel?: string;
};

const SHORT: Record<DayKey, string> = {
  mon: "Seg",
  tue: "Ter",
  wed: "Qua",
  thu: "Qui",
  fri: "Sex",
  sat: "Sáb",
  sun: "Dom",
};
const WEEKDAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];

type Status = "open" | "closed" | "empty";
const statusOf = (d: DayFormDefaults): Status =>
  d.closed ? "closed" : d.open || d.close ? "open" : "empty";

/** Grupo "título + dois horários". */
function TimeGroup({
  icon: Icon,
  title,
  startName,
  endName,
  start,
  end,
  onStart,
  onEnd,
  invalid,
}: {
  icon: typeof Clock;
  title: string;
  startName: string;
  endName: string;
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
  invalid: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="label-caps flex items-center gap-2 text-[0.7rem]">
        <Icon className="size-3.5 text-gold" aria-hidden="true" />
        {title}
      </span>
      <div className="flex items-center gap-2.5">
        <Input
          type="time"
          name={startName}
          value={start}
          onChange={(e) => onStart(e.target.value)}
          aria-label={`${title}: início`}
          aria-invalid={invalid}
          className="field-luxe text-center"
        />
        <span className="text-xs text-muted-foreground">às</span>
        <Input
          type="time"
          name={endName}
          value={end}
          onChange={(e) => onEnd(e.target.value)}
          aria-label={`${title}: fim`}
          aria-invalid={invalid}
          className="field-luxe text-center"
        />
      </div>
    </div>
  );
}

const toMin = (t: string) => {
  const m = /^(d{2}):(d{2})$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const duration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};

/** Um campo de horário com rótulo em cima. */
function TimeField({
  label,
  name,
  value,
  onChange,
  invalid,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      {/* No celular o rótulo pode quebrar em 2 linhas: alinha pela base para os campos ficarem na mesma altura */}
      <span className="label-caps flex min-h-8 items-end text-[0.65rem] leading-tight tracking-[0.14em] lg:min-h-0 lg:text-[0.7rem] lg:tracking-[0.2em]">
        {label}
      </span>
      <Input
        type="time"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className="field-luxe text-center"
      />
    </label>
  );
}

/**
 * Os 4 horários do dia em sequência: entrada, saída para o almoço, volta do almoço e saída.
 * O que fica entre a saída e a volta é o almoço (deixe os dois do meio em branco se não
 * houver pausa). Uma barra mostra o dia: dourado = trabalhando, vazio = almoço.
 */
function ShiftFields({
  day,
  d,
  update,
  invalid,
  breakLabel,
}: {
  day: DayKey;
  d: DayFormDefaults;
  update: (patch: Partial<DayFormDefaults>) => void;
  invalid: boolean;
  breakLabel: string;
}) {
  const open = toMin(d.open);
  const close = toMin(d.close);
  const bs = toMin(d.breakStart);
  const be = toMin(d.breakEnd);

  const shiftOk = open !== null && close !== null && open < close;
  const breakOk = shiftOk && bs !== null && be !== null && open < bs && bs < be && be < close;
  const total = shiftOk ? close - open : 0;
  const worked = shiftOk ? total - (breakOk ? be - bs : 0) : 0;
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-4 lg:grid-cols-4">
        <TimeField label="Entrada" name={`hours_${day}_open`} value={d.open} onChange={(v) => update({ open: v })} invalid={invalid} />
        <TimeField
          label={`Saída p/ ${breakLabel.toLowerCase()}`}
          name={`hours_${day}_break_start`}
          value={d.breakStart}
          onChange={(v) => update({ breakStart: v })}
          invalid={invalid}
        />
        <TimeField
          label={`Volta do ${breakLabel.toLowerCase()}`}
          name={`hours_${day}_break_end`}
          value={d.breakEnd}
          onChange={(v) => update({ breakEnd: v })}
          invalid={invalid}
        />
        <TimeField label="Saída" name={`hours_${day}_close`} value={d.close} onChange={(v) => update({ close: v })} invalid={invalid} />
      </div>

      {/* Linha do dia: só aparece quando entrada e saída estão preenchidas */}
      {shiftOk ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <div className="flex h-2.5 overflow-hidden rounded-full border border-border bg-[#0b0b0b]/60">
            {breakOk ? (
              <>
                <span className="bg-gold" style={{ width: pct(bs - open) }} />
                <span className="bg-transparent" style={{ width: pct(be - bs) }} />
                <span className="bg-gold" style={{ width: pct(close - be) }} />
              </>
            ) : (
              <span className="w-full bg-gold" />
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-gold" />
              {duration(worked)} de trabalho
            </span>
            {breakOk ? (
              <span className="flex items-center gap-1.5">
                <Coffee className="size-3.5 text-gold" />
                {breakLabel} {d.breakStart} às {d.breakEnd} ({duration(be - bs)})
              </span>
            ) : (
              <span>Sem {breakLabel.toLowerCase()}</span>
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Horário por dia, um dia de cada vez: faixa com os 7 dias (mostra o resumo de cada um)
 * e, embaixo, o editor do dia escolhido: interruptor de folga, expediente e almoço.
 * "Aplicar a todos os dias" evita digitar a mesma coisa 7 vezes. Todos os dias ficam
 * montados (só escondidos) para o formulário enviar tudo de uma vez.
 */
export function HoursFields({
  defaultValue,
  errors,
  legend = "Horário de funcionamento",
  hint = "Deixe os horários em branco para não informar o dia.",
  closedLabel = "Fechado",
  withBreak = false,
  breakLabel = "Almoço",
}: Props) {
  const [days, setDays] = useState(() => hoursToFormDefaults(defaultValue));
  const errorOf = (k: DayKey) => errors?.[`hours_${k}`];
  const firstError = DAYS.find((d) => errorOf(d.key))?.key;
  const [selected, setSelected] = useState<DayKey>(firstError ?? "mon");

  // Chegou erro novo do servidor: abre o primeiro dia com problema.
  const errKey = DAYS.map((d) => errorOf(d.key) ?? "").join("|");
  const [seenErr, setSeenErr] = useState(errKey);
  if (errKey !== seenErr) {
    setSeenErr(errKey);
    if (firstError) setSelected(firstError);
  }

  const update = (k: DayKey, patch: Partial<DayFormDefaults>) =>
    setDays((d) => ({ ...d, [k]: { ...d[k], ...patch } }));

  function copyTo(targets: DayKey[]) {
    const src = days[selected];
    setDays((d) => {
      const next = { ...d };
      for (const t of targets) if (t !== selected) next[t] = { ...src };
      return next;
    });
  }

  const currentLabel = DAYS.find((d) => d.key === selected)!.label;

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="label-caps mb-1">{legend}</legend>
      <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>

      {/* Faixa dos dias */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="group" aria-label="Dia da semana">
        {DAYS.map(({ key, label }) => {
          const d = days[key];
          const status = statusOf(d);
          const active = key === selected;
          const hasError = !!errorOf(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              aria-label={label}
              onClick={() => setSelected(key)}
              className={cn(
                "relative flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-xl border px-1 py-2.5 outline-none transition-all duration-200 focus-visible:ring-3 focus-visible:ring-ring/50 sm:py-3",
                active
                  ? "border-gold bg-gold/10 shadow-[0_0_0_3px_rgb(192_160_98/0.12)]"
                  : "border-border bg-[#0b0b0b]/40 hover:border-gold/40",
                hasError && !active && "border-destructive/70",
              )}
            >
              <span
                className={cn(
                  "font-label text-xs font-medium uppercase tracking-[0.14em]",
                  active ? "text-gold" : status === "closed" ? "text-muted-foreground/60" : "text-foreground",
                )}
              >
                {SHORT[key]}
              </span>
              {/* Resumo: horário (telas maiores) ou só um ponto de status (celular) */}
              <span className="hidden text-[0.65rem] leading-tight text-muted-foreground sm:block">
                {status === "open" ? (
                  <>
                    {d.open || "--:--"}
                    <br />
                    {d.close || "--:--"}
                  </>
                ) : status === "closed" ? (
                  "Folga"
                ) : (
                  "—"
                )}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full sm:hidden",
                  status === "open" ? "bg-gold" : status === "closed" ? "bg-muted-foreground/40" : "bg-border",
                )}
              />
              {hasError ? (
                <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Editor do dia (todos montados; só o escolhido aparece) */}
      {DAYS.map(({ key }) => {
        const d = days[key];
        const err = errorOf(key);
        return (
          <div
            key={key}
            hidden={key !== selected}
            className="flex flex-col gap-5 rounded-2xl border border-border bg-[#0b0b0b]/40 p-3.5 sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2.5 font-heading text-base font-semibold uppercase tracking-wide">
                <CalendarDays className="size-4 text-gold" aria-hidden="true" />
                {DAYS.find((x) => x.key === key)!.label}
              </h3>
              <Switch
                name={`hours_${key}_closed`}
                checked={d.closed}
                onChange={(e) => update(key, { closed: e.target.checked })}
              >
                {closedLabel}
              </Switch>
            </div>

            {d.closed ? (
              <p className="flex items-center gap-2.5 rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                <Moon className="size-4 text-gold/70" aria-hidden="true" />
                Sem expediente neste dia.
              </p>
            ) : (
              withBreak ? (
                <ShiftFields
                  day={key}
                  d={d}
                  update={(patch) => update(key, patch)}
                  invalid={!!err}
                  breakLabel={breakLabel}
                />
              ) : (
                <TimeGroup
                  icon={Clock}
                  title="Expediente"
                  startName={`hours_${key}_open`}
                  endName={`hours_${key}_close`}
                  start={d.open}
                  end={d.close}
                  onStart={(v) => update(key, { open: v })}
                  onEnd={(v) => update(key, { close: v })}
                  invalid={!!err}
                />
              )
            )}

            {err ? <p className="text-xs text-destructive">{err}</p> : null}
          </div>
        );
      })}

      {/* Atalhos para não repetir o mesmo horário em todos os dias */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full text-xs text-muted-foreground sm:w-auto">Copiar {currentLabel.toLowerCase()} para:</span>
        <Button type="button" variant="outline" size="sm" className="h-9 flex-1 sm:h-7 sm:flex-none" onClick={() => copyTo(DAYS.map((d) => d.key))}>
          <Copy />
          Todos os dias
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-9 flex-1 sm:h-7 sm:flex-none" onClick={() => copyTo(WEEKDAYS)}>
          <Copy />
          Segunda a sexta
        </Button>
      </div>
    </fieldset>
  );
}

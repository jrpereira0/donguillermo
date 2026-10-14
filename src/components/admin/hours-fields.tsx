"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { DAYS, hoursToFormDefaults, type DayKey } from "@/lib/validation/unit";

type Props = {
  /** JSON salvo em units.opening_hours (ou null). */
  defaultValue?: unknown;
  errors?: Record<string, string | undefined>;
};

/** Horário de funcionamento: por dia, "fechado" ou abertura/fechamento. Dia em branco = não informado. */
export function HoursFields({ defaultValue, errors }: Props) {
  const initial = hoursToFormDefaults(defaultValue);
  const [closed, setClosed] = useState<Record<DayKey, boolean>>(
    () =>
      Object.fromEntries(DAYS.map((d) => [d.key, initial[d.key].closed])) as Record<
        DayKey,
        boolean
      >,
  );

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="label-caps mb-1">Horário de funcionamento</legend>
      <p className="text-xs text-muted-foreground">
        Deixe os horários em branco para não informar o dia.
      </p>
      <div className="flex flex-col gap-2">
        {DAYS.map(({ key, label }) => {
          const err = errors?.[`hours_${key}`];
          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[9rem_auto_1fr]">
                <span className="text-sm">{label}</span>
                <label className="flex items-center gap-2 text-sm text-muted-foreground sm:order-3 sm:justify-self-end">
                  <input
                    type="checkbox"
                    name={`hours_${key}_closed`}
                    defaultChecked={initial[key].closed}
                    onChange={(e) => setClosed((c) => ({ ...c, [key]: e.target.checked }))}
                    className="size-4 accent-gold"
                  />
                  Fechado
                </label>
                <div className="col-span-2 flex items-center gap-2 sm:order-2 sm:col-span-1">
                  <Input
                    type="time"
                    name={`hours_${key}_open`}
                    defaultValue={initial[key].open}
                    disabled={closed[key]}
                    aria-label={`${label}: abertura`}
                    aria-invalid={!!err}
                    className="w-32"
                  />
                  <span className="text-muted-foreground">às</span>
                  <Input
                    type="time"
                    name={`hours_${key}_close`}
                    defaultValue={initial[key].close}
                    disabled={closed[key]}
                    aria-label={`${label}: fechamento`}
                    aria-invalid={!!err}
                    className="w-32"
                  />
                </div>
              </div>
              {err ? <p className="text-xs text-destructive">{err}</p> : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

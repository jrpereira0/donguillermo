import { Clock } from "lucide-react";
import type { SelectOption } from "@/components/ui/select";
import { DURATIONS, formatDuration } from "@/lib/validation/service";

/** Valor do item "padrão" (o Select não aceita valor vazio). */
export const DEFAULT_MINUTES_VALUE = "padrao";

/** Opções de duração própria: "Padrão (30 min)" + as durações oferecidas no formulário. */
export function durationOptions(defaultMinutes: number): SelectOption[] {
  return [
    {
      value: DEFAULT_MINUTES_VALUE,
      label: Number.isFinite(defaultMinutes) && defaultMinutes > 0 ? `Padrão (${formatDuration(defaultMinutes)})` : "Padrão",
      icon: Clock,
    },
    ...DURATIONS.map((m) => ({ value: String(m), label: formatDuration(m), icon: Clock })),
  ];
}

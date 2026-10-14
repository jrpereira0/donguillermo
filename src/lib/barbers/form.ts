import { DAYS, type OpeningHours } from "@/lib/validation/unit";

/** Valores digitados (strings) para devolver ao formulário em caso de erro; senhas ficam de fora. */
export function collectValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    if (key === "password" || key === "confirm" || key.startsWith("$ACTION")) continue;
    out[key] = value;
  }
  return out;
}

/** Reconstrói o horário digitado (mesmo inválido) para repopular os campos de horário. */
export function hoursFromValues(values: Record<string, string>): OpeningHours {
  const out: OpeningHours = {};
  for (const { key } of DAYS) {
    if (values[`hours_${key}_closed`] === "on") out[key] = { closed: true };
    else {
      const open = values[`hours_${key}_open`] ?? "";
      const close = values[`hours_${key}_close`] ?? "";
      const start = values[`hours_${key}_break_start`] ?? "";
      const end = values[`hours_${key}_break_end`] ?? "";
      if (open || close) out[key] = { open, close, ...(start || end ? { break: { start, end } } : {}) };
    }
  }
  return out;
}

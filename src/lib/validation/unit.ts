import { z } from "zod";
import { emailField, newPasswordSchema, toFieldErrors } from "./auth";

/** "São Bernardo - Metrópole" -> "sao-bernardo-metropole". */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "O endereço (slug) deve ter pelo menos 3 caracteres.")
  .max(60, "O endereço (slug) deve ter no máximo 60 caracteres.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use só letras minúsculas, números e hífens (ex.: sao-bernardo-metropole).",
  );

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} muito longo (máx. ${max} caracteres).`)
    .transform((v) => (v === "" ? null : v));

export const unitDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome da unidade.")
    .max(120, "Nome muito longo (máx. 120 caracteres)."),
  address: optionalText(200, "Endereço"),
  phone: z
    .string()
    .trim()
    .max(30, "Telefone muito longo.")
    .regex(/^[0-9+()\-\s.]*$/, "Telefone inválido: use só números e + ( ) -.")
    .transform((v) => (v === "" ? null : v)),
});

export const createUnitSchema = unitDetailsSchema.extend({
  slug: slugSchema,
  receptionEmail: emailField,
  receptionName: optionalText(120, "Nome"),
});

export const inviteReceptionSchema = z.object({
  email: emailField,
  fullName: optionalText(120, "Nome"),
});

/** Valida a senha digitada pelo admin (mesma política forte do restante do sistema). */
export function parseAccessPassword(
  password: string,
  confirm: string,
): { ok: true; password: string } | { ok: false; errors: Record<string, string> } {
  const r = newPasswordSchema.safeParse({ password, confirm });
  return r.success ? { ok: true, password } : { ok: false, errors: toFieldErrors(r.error) };
}

// ---------------- Horário de funcionamento ----------------

export const DAYS = [
  { key: "mon", label: "Segunda-feira" },
  { key: "tue", label: "Terça-feira" },
  { key: "wed", label: "Quarta-feira" },
  { key: "thu", label: "Quinta-feira" },
  { key: "fri", label: "Sexta-feira" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
] as const;

export type DayKey = (typeof DAYS)[number]["key"];
/** `break` (almoço/intervalo) é opcional e só usado na agenda dos profissionais. */
export type DayHours =
  | { open: string; close: string; break?: { start: string; end: string } }
  | { closed: true };
/** Dias não informados ficam de fora do objeto. */
export type OpeningHours = Partial<Record<DayKey, DayHours>>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Lê os campos hours_<dia>_{closed,open,close} do formulário.
 * Por dia: "fechado" marcado -> {closed}; os dois horários vazios -> dia não
 * informado; senão exige HH:MM válidos com abertura antes do fechamento.
 * Com `withBreak`, lê também hours_<dia>_break_{start,end} (almoço): os dois ou nenhum,
 * e o intervalo precisa ficar dentro do expediente.
 */
export function parseOpeningHours(
  form: FormData,
  options: { withBreak?: boolean } = {},
):
  | { ok: true; value: OpeningHours | null }
  | { ok: false; errors: Record<string, string> } {
  const value: OpeningHours = {};
  const errors: Record<string, string> = {};

  for (const { key, label } of DAYS) {
    const closed = form.get(`hours_${key}_closed`) === "on";
    const open = String(form.get(`hours_${key}_open`) ?? "").trim();
    const close = String(form.get(`hours_${key}_close`) ?? "").trim();

    if (closed) {
      value[key] = { closed: true };
    } else if (open === "" && close === "") {
      continue;
    } else if (!TIME.test(open) || !TIME.test(close)) {
      errors[`hours_${key}`] = `${label}: informe abertura e fechamento (HH:MM).`;
    } else if (open >= close) {
      errors[`hours_${key}`] = `${label}: a abertura deve ser antes do fechamento.`;
    } else {
      const bs = options.withBreak ? String(form.get(`hours_${key}_break_start`) ?? "").trim() : "";
      const be = options.withBreak ? String(form.get(`hours_${key}_break_end`) ?? "").trim() : "";
      if (bs === "" && be === "") {
        value[key] = { open, close };
      } else if (!TIME.test(bs) || !TIME.test(be)) {
        errors[`hours_${key}`] = `${label}: informe início e fim do almoço (HH:MM).`;
      } else if (!(open < bs && bs < be && be < close)) {
        errors[`hours_${key}`] = `${label}: o almoço deve ficar dentro do expediente, com início antes do fim.`;
      } else {
        value[key] = { open, close, break: { start: bs, end: be } };
      }
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: Object.keys(value).length ? value : null };
}

/** Valores iniciais dos campos de horário a partir do JSON salvo. */
export type DayFormDefaults = {
  closed: boolean;
  open: string;
  close: string;
  breakStart: string;
  breakEnd: string;
};

export function hoursToFormDefaults(hours: unknown): Record<DayKey, DayFormDefaults> {
  const src = (hours && typeof hours === "object" ? hours : {}) as OpeningHours;
  const out = {} as Record<DayKey, DayFormDefaults>;
  const blank = { closed: false, open: "", close: "", breakStart: "", breakEnd: "" };
  for (const { key } of DAYS) {
    const d = src[key];
    out[key] =
      d && "closed" in d
        ? { ...blank, closed: true }
        : d
          ? { ...blank, open: d.open, close: d.close, breakStart: d.break?.start ?? "", breakEnd: d.break?.end ?? "" }
          : blank;
  }
  return out;
}

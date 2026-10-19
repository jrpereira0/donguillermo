import { z } from "zod";
import { isHHMM, isIsoDate, toMinutes } from "@/lib/agenda/time";

/** Nome gravado quando o cliente não quer informar dados (avulso). */
export const WALKIN_CUSTOMER_NAME = "Cliente sem cadastro";

// ---------------- Situação do agendamento ----------------

export const APPOINTMENT_STATUS = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
  { value: "faltou", label: "Faltou" },
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[number]["value"];

export const statusLabel = (v: string) => APPOINTMENT_STATUS.find((s) => s.value === v)?.label ?? v;

/** Cancelado e falta liberam o horário do profissional. */
export const FREES_SLOT: readonly string[] = ["cancelado", "faltou"];
export const occupiesSlot = (status: string) => !FREES_SLOT.includes(status);

/**
 * Situações do menu de clique direito na grade (e da legenda).
 * A recepção pode saltar livremente entre elas.
 */
export const QUICK_STATUSES = [
  { value: "agendado", label: "Agendado" },
  { value: "confirmado", label: "Confirmado" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Excluído / cancelado" },
] as const;

/** Atalhos sugeridos no modal (o servidor aceita qualquer salto em QUICK_STATUSES). */
export const STATUS_MOVES: Record<AppointmentStatus, { to: AppointmentStatus; label: string; tone?: "danger" }[]> = {
  agendado: [
    { to: "confirmado", label: "Confirmar" },
    { to: "em_atendimento", label: "Iniciar atendimento" },
    { to: "faltou", label: "Marcar falta", tone: "danger" },
    { to: "cancelado", label: "Cancelar agendamento", tone: "danger" },
  ],
  confirmado: [
    { to: "em_atendimento", label: "Iniciar atendimento" },
    { to: "faltou", label: "Marcar falta", tone: "danger" },
    { to: "cancelado", label: "Cancelar agendamento", tone: "danger" },
  ],
  em_atendimento: [
    { to: "concluido", label: "Concluir atendimento" },
    { to: "cancelado", label: "Cancelar agendamento", tone: "danger" },
  ],
  concluido: [{ to: "em_atendimento", label: "Reabrir atendimento" }],
  // Cancelado some da grade (como excluído).
  cancelado: [],
  faltou: [{ to: "agendado", label: "Reativar agendamento" }],
};

const QUICK_SET = new Set<string>(QUICK_STATUSES.map((s) => s.value));

export function canMove(from: string, to: string): boolean {
  if (from === to || !isStatus(to)) return false;
  // Clique direito / recepção: qualquer situação rápida ↔ outra.
  if (QUICK_SET.has(from) && QUICK_SET.has(to)) return true;
  const moves = STATUS_MOVES[from as AppointmentStatus];
  return !!moves?.some((m) => m.to === to);
}

export function isStatus(v: string): v is AppointmentStatus {
  return APPOINTMENT_STATUS.some((s) => s.value === v);
}

// ---------------- Formulários ----------------

export const MAX_SERVICES = 8;
export const NOTES_MAX = 500;
export const BLOCK_REASON_MAX = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuid = (msg: string) => z.string().trim().regex(UUID, msg);
const dateField = z.string().trim().refine(isIsoDate, "Informe uma data válida.");
const timeField = (msg: string) => z.string().trim().refine(isHHMM, msg);
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} muito longa (máx. ${max} caracteres).`)
    .transform((v) => (v === "" ? null : v));

export const appointmentSchema = z
  .object({
    barberId: uuid("Escolha o profissional."),
    date: dateField,
    time: timeField("Informe o horário."),
    serviceIds: z
      .array(uuid("Serviço inválido."))
      .min(1, "Escolha pelo menos um serviço.")
      .max(MAX_SERVICES, `No máximo ${MAX_SERVICES} serviços por agendamento.`)
      .refine((ids) => new Set(ids).size === ids.length, "Serviço repetido."),
    customerMode: z.enum(["registered", "walkin"]),
    customerId: z.string().trim(),
    customerName: z.string().trim(),
    customerPhone: z.string().trim(),
    notes: optionalText(NOTES_MAX, "Observação"),
    force: z.string().transform((v) => v === "on"),
    /** "on" = sem preferência de profissional (métrica por barbeiro). */
    noPreference: z.string().transform((v) => v === "on"),
  })
  .superRefine((v, ctx) => {
    if (v.customerMode === "registered") {
      if (!UUID.test(v.customerId)) ctx.addIssue({ code: "custom", path: ["customerId"], message: "Escolha o cliente." });
    }
    // Avulso: sem nome/telefone — quem não quer informar dados.
  })
  // Cadastrado: nome/telefone vêm do banco no servidor. Avulso: rótulo fixo, sem telefone.
  .transform((v) => ({
    ...v,
    customerPhone: "",
    customerName: v.customerMode === "walkin" ? WALKIN_CUSTOMER_NAME : "",
    hasBarberPreference: !v.noPreference,
  }));

export type AppointmentInput = z.infer<typeof appointmentSchema>;

export const blockSchema = z
  .object({
    barberId: z.union([z.literal("all"), uuid("Escolha o profissional.")]),
    date: dateField,
    start: timeField("Informe o início."),
    end: timeField("Informe o fim."),
    reason: optionalText(BLOCK_REASON_MAX, "Motivo"),
  })
  .refine((v) => !isHHMM(v.start) || !isHHMM(v.end) || toMinutes(v.start) < toMinutes(v.end), {
    path: ["end"],
    message: "O fim deve ser depois do início.",
  });

export type BlockInput = z.infer<typeof blockSchema>;

// ---------------- Cálculo de duração e total ----------------

export type PricedService = { minutes: number; priceCents: number };

/** Soma de duração e de preço dos serviços escolhidos. */
export function totals(items: PricedService[]): { minutes: number; priceCents: number } {
  return items.reduce(
    (acc, s) => ({ minutes: acc.minutes + s.minutes, priceCents: acc.priceCents + s.priceCents }),
    { minutes: 0, priceCents: 0 },
  );
}

/**
 * @deprecated A agenda usa a duração real dos serviços (sem arredondar).
 * Mantido só para testes/legado de alinhamento ao passo.
 */
export function occupiedMinutes(serviceMinutes: number, slot: number): number {
  return Math.max(slot, Math.ceil(serviceMinutes / slot) * slot);
}

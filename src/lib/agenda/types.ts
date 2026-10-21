import type { UsableCustomerPackage } from "@/lib/packages/types";
import type { FormState } from "@/lib/validation/auth";

/** Profissional na grade (e no formulário). */
export type AgendaBarber = {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
  /** Expediente semanal (mesmo formato do horário da unidade, com intervalo opcional). */
  workHours: unknown;
  /** Profissional desativado que ainda tem horário neste dia. */
  inactive: boolean;
};

export type AgendaEntryService = {
  serviceId: string;
  name: string;
  minutes: number;
  priceCents: number;
};

/** Agendamento ou bloqueio, já em horário local da unidade. */
export type AgendaEntry = {
  id: string;
  barberId: string;
  kind: "appointment" | "block";
  status: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  /** Data local de início ("YYYY-MM-DD") e horários "HH:MM". */
  date: string;
  time: string;
  endTime: string;
  /** Minutos desde 00:00, limitados ao dia exibido (para posicionar na grade). */
  startMin: number;
  endMin: number;
  services: AgendaEntryService[];
  authorName: string | null;
  /** true = cliente pediu aquele profissional; false = sem preferência. */
  hasBarberPreference: boolean;
};

/** Serviço do catálogo oferecido na agenda. */
export type AgendaService = {
  id: string;
  name: string;
  categoryLabel: string;
  minutes: number;
  priceCents: number;
};

/** `offers[barberId][serviceId]` = duração própria em minutos (null = padrão); ausente = não faz o serviço. */
export type AgendaOffers = Record<string, Record<string, number | null>>;

/** Pacote utilizável do cliente nesta unidade, para agendar pelo pacote. */
export type AgendaCustomerPackage = UsableCustomerPackage;

export type AgendaCustomerHit = {
  id: string;
  name: string;
  phone: string | null;
  /** Pacotes ativos com saldo nesta unidade (undefined = ainda não carregado). */
  packages?: AgendaCustomerPackage[];
};

/** Estado devolvido pelo formulário de agendamento/bloqueio. */
export type AgendaFormState = FormState & {
  values?: Record<string, string>;
  /** Data do agendamento salvo: a grade pula para o dia certo se for outro. */
  savedDate?: string;
  /** O horário fere o expediente: só passa com a confirmação de encaixe. */
  needsForce?: boolean;
  /** Booking do cliente: horário ocupado — atualizar grade e pedir outro. Recepção não usa. */
  slotTaken?: boolean;
};

export const initialAgendaState: AgendaFormState = { status: "idle" };

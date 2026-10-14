import type { FormState } from "@/lib/validation/auth";

/** Bucket (público para leitura) das imagens dos serviços. */
export const SERVICE_IMAGE_BUCKET = "service-images";

/** Campos lidos pelas telas (a RLS já filtra por unidade). */
export const SERVICE_COLUMNS =
  "id, unit_id, name, description, category, duration_minutes, price_cents, is_active, image_path, created_at, updated_at";

export type ServiceRow = {
  id: string;
  unit_id: string;
  name: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  price_cents: number;
  is_active: boolean;
  image_path: string | null;
  created_at: string;
  updated_at: string;
};

/** Profissional como aparece na escolha de "quem faz o serviço" (dados mínimos, sem pessoais). */
export type AssignableBarber = {
  id: string;
  name: string;
  /** Função já traduzida ("Barbeiro", "Líder"...). */
  role: string;
  photoUrl: string | null;
};

/** Serviço como aparece na escolha de "o que o profissional faz" (dados mínimos). */
export type AssignableService = {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  /** Duração padrão, em minutos. */
  minutes: number;
  imageUrl: string | null;
};

/** Ligação profissional x serviço; `minutes` null = usa a duração padrão do serviço. */
export type ServiceBarberLink = { barberId: string; minutes: number | null };

/** Estado das actions de serviços; `values` devolve o digitado para o formulário não limpar com erro. */
export type ServiceFormState = FormState & { values?: Record<string, string> };

export const initialServiceState: ServiceFormState = { status: "idle" };

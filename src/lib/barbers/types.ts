import type { FormState } from "@/lib/validation/auth";

export const PHOTO_BUCKET = "barber-photos";

/** Campos lidos pelas telas (sem dados de outras unidades: a RLS já filtra). */
export const BARBER_COLUMNS =
  "id, unit_id, user_id, full_name, first_name, last_name, display_name, job_title, phone, birth_date, cnpj, cep, street, street_number, complement, neighborhood, city, state, photo_path, social, commission_services_pct, commission_products_pct, work_hours, is_active, created_at, updated_at, profiles(email, is_active)";

export type BarberRow = {
  id: string;
  unit_id: string;
  user_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  job_title: string;
  phone: string | null;
  birth_date: string | null;
  cnpj: string | null;
  cep: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  photo_path: string | null;
  social: unknown;
  commission_services_pct: number;
  commission_products_pct: number;
  work_hours: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profiles: { email: string; is_active: boolean } | null;
};

/**
 * Estado das actions de profissionais. `values` devolve o que foi digitado
 * (menos senhas) para o formulário não limpar os campos quando há erro.
 */
export type BarberFormState = FormState & { values?: Record<string, string> };

export const initialBarberState: BarberFormState = { status: "idle" };

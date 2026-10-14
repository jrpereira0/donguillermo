import type { FormState } from "@/lib/validation/auth";

/** Bucket (público para leitura) das fotos dos clientes. */
export const CUSTOMER_PHOTO_BUCKET = "customer-photos";

/** Campos lidos pelas telas (a RLS já limita a admin e recepção). */
export const CUSTOMER_COLUMNS =
  "id, created_unit_id, registered_via, full_name, phone, email, birth_date, cpf, photo_path, cep, street, street_number, complement, neighborhood, city, state, preferred_barber_id, referral_source, marketing_consent, consent_at, is_active, created_at, updated_at";

export type CustomerRow = {
  id: string;
  created_unit_id: string | null;
  registered_via: "recepcao" | "autocadastro";
  full_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  cpf: string | null;
  photo_path: string | null;
  cep: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  preferred_barber_id: string | null;
  referral_source: string | null;
  marketing_consent: boolean;
  consent_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Estado das actions de clientes; `values` devolve o digitado para o formulário não limpar com erro. */
export type CustomerFormState = FormState & { values?: Record<string, string> };

export const initialCustomerState: CustomerFormState = { status: "idle" };

/**
 * Uma comanda no histórico do cliente. Ainda não existe o módulo de comandas: a aba
 * "Histórico" já aceita esta lista e mostra o estado vazio até as comandas existirem.
 * A unidade de cada atendimento é sempre exibida (o cliente é da rede).
 */
export type CustomerHistoryEntry = {
  id: string;
  /** ISO 8601 (abertura da comanda). */
  openedAt: string;
  unitName: string;
  barberName: string | null;
  status: "aberta" | "fechada" | "cancelada";
  totalCents: number;
  /** Resumo dos itens, ex.: ["Corte masculino", "Barba"]. */
  items: string[];
};

/** Observação da lista do cliente, já pronta para a tela. */
export type CustomerNote = {
  id: string;
  body: string;
  /** Quem escreveu (nome guardado na hora) e a unidade onde foi escrita. */
  authorName: string | null;
  unitName: string | null;
  createdAt: string;
  updatedAt: string;
};

import type { FormState } from "@/lib/validation/auth";

/** Bucket (público para leitura) com logo e capa das unidades. */
export const UNIT_ASSET_BUCKET = "unit-assets";

/** Campos lidos pela tela de Configurações. */
export const UNIT_SETTINGS_COLUMNS =
  "id, slug, name, address, phone, opening_hours, cnpj, cep, street, street_number, complement, neighborhood, city, state, phones, slot_minutes, logo_path, cover_path, updated_at";

export type UnitSettingsRow = {
  id: string;
  slug: string;
  name: string;
  /** Endereço em uma linha (legado/painel da rede). */
  address: string | null;
  phone: string | null;
  opening_hours: unknown;
  cnpj: string | null;
  cep: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  phones: unknown;
  slot_minutes: number;
  logo_path: string | null;
  cover_path: string | null;
  updated_at: string;
};

/** Estado do formulário: `values` devolve o digitado quando há erro (React limpa os campos). */
export type UnitSettingsState = FormState & { values?: Record<string, string> };

export const initialUnitSettingsState: UnitSettingsState = { status: "idle" };

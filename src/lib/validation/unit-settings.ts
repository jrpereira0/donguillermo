import { z } from "zod";
import {
  cepField,
  cityField,
  cnpjField,
  complementField,
  formatCep,
  isValidPhone,
  maskPhone,
  neighborhoodField,
  onlyDigits,
  phoneDigits,
  stateField,
  streetField,
  streetNumberField,
} from "./barber";

// ---------------- Agenda ----------------

/** Tempo de cada linha da agenda, em minutos. */
export const SLOT_OPTIONS = [5, 10, 15, 20, 30, 60] as const;
export const DEFAULT_SLOT_MINUTES = 30;

export const slotLabel = (minutes: number) => (minutes === 60 ? "1 hora" : `${minutes} minutos`);

export const slotField = z
  .string()
  .trim()
  .refine((v) => (SLOT_OPTIONS as readonly number[]).includes(Number(v)), "Escolha o tempo de cada linha da agenda.")
  .transform((v) => Number(v));

/** Quantos serviços têm duração que não é múltipla do tempo da linha (a agenda arredonda para cima). */
export function misalignedServices(durations: number[], slot: number): number {
  return durations.filter((d) => d % slot !== 0).length;
}

// ---------------- Telefones ----------------

export const PHONE_LIMIT = 5;
export const PHONE_LABEL_MAX = 30;

export type UnitPhone = { label: string; number: string; whatsapp: boolean };

/** Lê o JSON de telefones do formulário (`[{label, number, whatsapp}]`) e valida cada linha. */
export function parsePhones(
  raw: string,
): { ok: true; value: UnitPhone[] } | { ok: false; errors: Record<string, string> } {
  let data: unknown;
  try {
    data = raw.trim() === "" ? [] : JSON.parse(raw);
  } catch {
    return { ok: false, errors: { phones: "Telefones inválidos. Recarregue a página e tente de novo." } };
  }
  if (!Array.isArray(data)) return { ok: false, errors: { phones: "Telefones inválidos." } };
  if (data.length > PHONE_LIMIT) {
    return { ok: false, errors: { phones: `Informe no máximo ${PHONE_LIMIT} telefones.` } };
  }

  const errors: Record<string, string> = {};
  const value: UnitPhone[] = [];
  const seen = new Set<string>();

  data.forEach((item, i) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const number = typeof row.number === "string" ? row.number : "";
    const whatsapp = row.whatsapp === true;

    if (label === "") errors[`phone_${i}_label`] = "Dê um nome ao telefone (ex.: Recepção).";
    else if (label.length > PHONE_LABEL_MAX) errors[`phone_${i}_label`] = `Nome muito longo (máx. ${PHONE_LABEL_MAX}).`;

    if (onlyDigits(number) === "") errors[`phone_${i}_number`] = "Informe o telefone.";
    else if (!isValidPhone(number)) errors[`phone_${i}_number`] = "Telefone inválido. Use DDD + número.";
    else if (seen.has(phoneDigits(number))) errors[`phone_${i}_number`] = "Este telefone já foi informado.";

    if (!errors[`phone_${i}_label`] && !errors[`phone_${i}_number`]) {
      seen.add(phoneDigits(number));
      value.push({ label, number: phoneDigits(number), whatsapp });
    }
  });

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Lê o jsonb salvo (qualquer coisa) como lista de telefones válida; ignora o que estiver fora do formato. */
export function phonesFromDb(raw: unknown): UnitPhone[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const { label, number, whatsapp } = p as Record<string, unknown>;
    return typeof label === "string" && typeof number === "string"
      ? [{ label, number, whatsapp: whatsapp === true }]
      : [];
  });
}

// ---------------- Dados da unidade ----------------

export const unitNameField = z
  .string()
  .trim()
  .min(2, "Informe o nome da barbearia.")
  .max(120, "Nome muito longo (máx. 120 caracteres).");

export const unitSettingsSchema = z.object({
  name: unitNameField,
  cnpj: cnpjField,
  cep: cepField,
  street: streetField,
  streetNumber: streetNumberField,
  complement: complementField,
  neighborhood: neighborhoodField,
  city: cityField,
  state: stateField,
  slotMinutes: slotField,
});

export type UnitAddressParts = {
  street: string | null;
  streetNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
};

/** Endereço em uma linha (coluna `address`, usada nos cartões do painel da rede). */
export function composeAddress(a: UnitAddressParts): string | null {
  const street = [a.street, a.streetNumber].filter(Boolean).join(", ");
  const withComplement = [street, a.complement].filter(Boolean).join(" - ");
  const city = a.city && a.state ? `${a.city}/${a.state}` : (a.city ?? a.state);
  const text = [withComplement, a.neighborhood, city].filter(Boolean).join(", ");
  const full = a.cep ? [text, `CEP ${formatCep(a.cep)}`].filter(Boolean).join(" - ") : text;
  return full === "" ? null : full.slice(0, 200);
}

/** Telefone principal em texto (coluna `phone`): o primeiro da lista, com máscara. */
export const primaryPhone = (phones: UnitPhone[]): string | null =>
  phones[0] ? maskPhone(phones[0].number) : null;

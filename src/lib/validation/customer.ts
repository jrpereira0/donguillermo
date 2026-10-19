import { z } from "zod";
import { emailProblem } from "./auth";
import {
  birthDateField,
  cepField,
  cityField,
  complementField,
  neighborhoodField,
  onlyDigits,
  phoneDigits,
  isValidPhone,
  stateField,
  streetField,
  streetNumberField,
} from "./barber";

// ---------------- CPF ----------------

/** CPF com dígitos verificadores (rejeita 111.111.111-11 e parecidos). */
export function isValidCpf(input: string): boolean {
  const d = onlyDigits(input);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]);
}

/** "12345678909" -> "123.456.789-09" (máscara enquanto digita). */
export function maskCpf(input: string | null | undefined): string {
  const d = onlyDigits(input ?? "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Mensagem de erro do CPF digitado, ou null se vazio/válido. */
export function cpfProblem(v: string): string | null {
  if (v.trim() === "") return null;
  return isValidCpf(v) ? null : "CPF inválido. Confira os números.";
}

// ---------------- Como conheceu

export const REFERRAL_SOURCES = [
  { value: "indicacao", label: "Indicação de amigo" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "google", label: "Google" },
  { value: "passou_em_frente", label: "Passou em frente" },
  { value: "outro", label: "Outro" },
] as const;

export type ReferralSource = (typeof REFERRAL_SOURCES)[number]["value"];

export const referralLabel = (v: string | null | undefined) =>
  REFERRAL_SOURCES.find((r) => r.value === v)?.label ?? null;

// ---------------- Campos ----------------

const empty = (v: string) => v === "";

/** Partículas que ficam em minúsculo no meio do nome (pt-BR). */
const NAME_PARTICLES = new Set(["da", "das", "de", "do", "dos", "e"]);

/**
 * Formata nome de pessoa: primeira letra maiúscula em cada palavra
 * ("maria da SILVA" → "Maria da Silva").
 */
export function formatPersonName(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLocaleLowerCase("pt-BR");
      if (i > 0 && NAME_PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
    })
    .join(" ");
}

export const customerNameField = z
  .string()
  .trim()
  .min(2, "Informe o nome do cliente.")
  .max(120, "Nome muito longo (máx. 120 caracteres).")
  .transform(formatPersonName);

/** Telefone obrigatório no painel (é o contato principal): guarda só os dígitos. */
export const customerPhoneField = z
  .string()
  .trim()
  .min(1, "Informe o telefone.")
  .max(30, "Telefone muito longo.")
  .refine((v) => isValidPhone(v), "Telefone inválido. Use DDD + número, ex.: (11) 91234-5678.")
  .transform((v) => phoneDigits(v));

export const customerEmailField = z
  .string()
  .trim()
  .max(254, "E-mail muito longo.")
  .refine((v) => empty(v) || emailProblem(v) === null, "Informe um e-mail válido.")
  .transform((v) => (empty(v) ? null : v.toLowerCase()));

export const cpfField = z
  .string()
  .trim()
  .max(20, "CPF muito longo.")
  .refine((v) => empty(v) || isValidCpf(v), "CPF inválido. Confira os números.")
  .transform((v) => (empty(v) ? null : onlyDigits(v)));

export const referralField = z
  .string()
  .trim()
  .refine((v) => empty(v) || REFERRAL_SOURCES.some((r) => r.value === v), "Opção inválida.")
  .transform((v) => (empty(v) ? null : v));

/** Texto de uma observação (obrigatório, até 1000 caracteres). */
export const noteBodyField = z
  .string()
  .trim()
  .min(1, "Escreva a observação.")
  .max(1000, "Observação muito longa (máx. 1000 caracteres).");

export const noteSchema = z.object({ body: noteBodyField });

/** Interruptor de formulário: "on" quando ligado. */
export const consentField = z.string().transform((v) => v === "on");

export const customerSchema = z.object({
  fullName: customerNameField,
  phone: customerPhoneField,
  email: customerEmailField,
  birthDate: birthDateField,
  cpf: cpfField,
  cep: cepField,
  street: streetField,
  streetNumber: streetNumberField,
  complement: complementField,
  neighborhood: neighborhoodField,
  city: cityField,
  state: stateField,
  referralSource: referralField,
  marketingConsent: consentField,
});

/** Idade em anos completos (ou null). `today` existe para facilitar teste. */
export function ageFrom(birthDate: string | null | undefined, today = new Date()): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  const had = today.getUTCMonth() + 1 > m || (today.getUTCMonth() + 1 === m && today.getUTCDate() >= d);
  if (!had) age -= 1;
  return age >= 0 ? age : null;
}

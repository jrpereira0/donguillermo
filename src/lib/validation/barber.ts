import { z } from "zod";
import { emailField } from "./auth";

/** Só os dígitos. */
export const onlyDigits = (v: string) => v.replace(/\D/g, "");

// ---------------- CNPJ ----------------
// Desde julho/2026 o CNPJ pode ter letras nas 12 primeiras posições (os 2 últimos
// caracteres, os dígitos verificadores, continuam numéricos). Os CNPJs numéricos
// antigos seguem válidos. Guardamos 14 caracteres, maiúsculos, sem máscara.

/** Mantém letras e números, em maiúsculas. */
export const cleanCnpj = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Dígito verificador: cada caractere vale (código ASCII - 48); pesos 2..9 da direita p/ esquerda. */
function cnpjCheckDigit(base: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += (base.charCodeAt(i) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

/** CNPJ válido (numérico ou alfanumérico), com os 2 dígitos verificadores corretos. */
export function isValidCnpj(input: string): boolean {
  const c = cleanCnpj(input);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const d1 = cnpjCheckDigit(c.slice(0, 12));
  const d2 = cnpjCheckDigit(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

/**
 * Máscara 00.000.000/0000-00, boa para usar enquanto digita (aceita entrada parcial).
 * Posições 13 e 14 só aceitam número.
 */
export function maskCnpj(input: string | null | undefined): string {
  let c = "";
  for (const ch of cleanCnpj(input ?? "")) {
    if (c.length >= 14) break;
    if (c.length >= 12 && !/[0-9]/.test(ch)) continue;
    c += ch;
  }
  const [a, b, d, e, f] = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8), c.slice(8, 12), c.slice(12, 14)];
  return a + (b && `.${b}`) + (d && `.${d}`) + (e && `/${e}`) + (f && `-${f}`);
}

/** Mensagem de erro do CNPJ digitado, ou null se vazio/válido. */
export function cnpjProblem(v: string): string | null {
  if (v.trim() === "") return null;
  return isValidCnpj(v) ? null : "CNPJ inválido. Confira os números.";
}

// ---------------- Telefone ----------------

/** Dígitos do telefone no padrão nacional (sem +55 / 55 na frente, se vier colado assim). */
export function phoneDigits(v: string): string {
  const d = onlyDigits(v);
  return d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
}

/**
 * Telefone brasileiro: DDD (11 a 99) + fixo de 8 dígitos (começa com 2 a 5) ou
 * celular de 9 dígitos (começa com 9).
 */
export function isValidPhone(input: string): boolean {
  const d = phoneDigits(input);
  if (!/^[1-9][1-9]\d{8,9}$/.test(d)) return false;
  const number = d.slice(2);
  if (/^(\d)\1+$/.test(number)) return false;
  return d.length === 11 ? number[0] === "9" : /^[2-5]/.test(number);
}

/** Máscara (11) 91234-5678 ou (11) 1234-5678, boa para usar enquanto digita. */
export function maskPhone(input: string | null | undefined): string {
  const d = phoneDigits(input ?? "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  const split = d.length === 11 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** Mensagem de erro do telefone digitado, ou null se vazio/válido. */
export function phoneProblem(v: string): string | null {
  if (v.trim() === "") return null;
  return isValidPhone(v) ? null : "Telefone inválido. Use DDD + número, ex.: (11) 91234-5678.";
}

// ---------------- Função (cargo) ----------------
// Informativa: não muda o que a pessoa pode fazer no sistema (isso é o papel de acesso).

export const JOB_TITLES = [
  { value: "barbeiro", label: "Barbeiro" },
  { value: "recepcionista", label: "Recepcionista" },
  { value: "gerente", label: "Gerente" },
  { value: "lider", label: "Líder" },
  { value: "auxiliar", label: "Auxiliar" },
] as const;

export type JobTitle = (typeof JOB_TITLES)[number]["value"];

export const jobTitleLabel = (v: string | null | undefined) =>
  JOB_TITLES.find((j) => j.value === v)?.label ?? "Barbeiro";

export const jobTitleField = z.enum(JOB_TITLES.map((j) => j.value) as [JobTitle, ...JobTitle[]], {
  error: "Escolha a função do profissional.",
});

// ---------------- Campos ----------------

const empty = (v: string) => v === "";

export const firstNameField = z
  .string()
  .trim()
  .min(2, "Informe o nome.")
  .max(60, "Nome muito longo (máx. 60 caracteres).");

export const lastNameField = z
  .string()
  .trim()
  .min(2, "Informe o sobrenome.")
  .max(60, "Sobrenome muito longo (máx. 60 caracteres).");

/** Nome completo exibido em listas: "Nome Sobrenome". */
export const fullNameOf = (first: string, last: string) => `${first.trim()} ${last.trim()}`.trim();

// ---------------- Endereço ----------------

/** CEP: aceita 00000-000 ou só dígitos; guarda 8 dígitos. */
export const cepField = z
  .string()
  .trim()
  .refine((v) => empty(v) || onlyDigits(v).length === 8, "CEP inválido (8 dígitos).")
  .transform((v) => (empty(v) ? null : onlyDigits(v)));

export const formatCep = (digits: string | null | undefined) => {
  const d = onlyDigits(digits ?? "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (digits ?? "");
};

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (empty(v) ? null : v));

export const streetField = optionalText(120, "Rua muito longa (máx. 120).");
export const streetNumberField = optionalText(20, "Número muito longo (máx. 20).");
export const complementField = optionalText(60, "Complemento muito longo (máx. 60).");
export const neighborhoodField = optionalText(80, "Bairro muito longo (máx. 80).");
export const cityField = optionalText(80, "Cidade muito longa (máx. 80).");

export const stateField = z
  .string()
  .trim()
  .refine((v) => empty(v) || /^[A-Za-z]{2}$/.test(v), "UF inválida (2 letras).")
  .transform((v) => (empty(v) ? null : v.toUpperCase()));

export const displayNameField = z
  .string()
  .trim()
  .min(2, "Informe o apelido (nome que aparece na agenda).")
  .max(40, "Apelido muito longo (máx. 40 caracteres).");

/** Telefone: guarda só os dígitos (DDD + número, 10 ou 11). */
export const phoneField = z
  .string()
  .trim()
  .max(30, "Telefone muito longo.")
  .refine((v) => empty(v) || isValidPhone(v), "Telefone inválido. Use DDD + número, ex.: (11) 91234-5678.")
  .transform((v) => (empty(v) ? null : phoneDigits(v)));

const validIsoDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  return v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10);
};

export const birthDateField = z
  .string()
  .trim()
  .refine((v) => empty(v) || validIsoDate(v), "Data de nascimento inválida.")
  .transform((v) => (empty(v) ? null : v));

export const cnpjField = z
  .string()
  .trim()
  .max(30, "CNPJ muito longo.")
  .refine((v) => empty(v) || isValidCnpj(v), "CNPJ inválido. Confira os números.")
  .transform((v) => (empty(v) ? null : cleanCnpj(v)));

/** "@usuario", "instagram.com/usuario/" ou "https://www.instagram.com/usuario?x=1" -> "usuario". */
export function normalizeHandle(raw: string, hosts: string[]): string {
  let v = raw.trim();
  for (const h of hosts) {
    v = v.replace(new RegExp(`^(https?:\\/\\/)?(www\\.|m\\.)?${h.replace(/\./g, "\\.")}\\/`, "i"), "");
  }
  return v.split(/[?#]/)[0]!.replace(/\/+$/, "").replace(/^@/, "");
}

const handleField = (hosts: string[], pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .max(200, message)
    .transform((v) => normalizeHandle(v, hosts))
    .refine((v) => empty(v) || pattern.test(v), message)
    .transform((v) => (empty(v) ? null : v));

export const instagramField = handleField(
  ["instagram.com"],
  /^[A-Za-z0-9._]{1,30}$/,
  "Instagram inválido: use @usuario ou o link do perfil.",
);
export const facebookField = handleField(
  ["facebook.com", "fb.com"],
  /^[A-Za-z0-9.]{5,50}$/,
  "Facebook inválido: use o nome do perfil ou o link.",
);
export const tiktokField = handleField(
  ["tiktok.com"],
  /^[A-Za-z0-9._]{2,24}$/,
  "TikTok inválido: use @usuario ou o link do perfil.",
);

/** "12", "12,5" ou "12.5" -> 12 / 12.5 (0 a 100, até 2 casas). Vazio = 0. */
export const percentField = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .refine((v) => empty(v) || /^\d{1,3}(\.\d{1,2})?$/.test(v), "Informe um percentual válido (ex.: 40 ou 12,5).")
  .transform((v) => (empty(v) ? 0 : Number(v)))
  .refine((n) => n >= 0 && n <= 100, "O percentual deve ficar entre 0 e 100.");

// ---------------- Schemas ----------------

export const barberDetailsSchema = z.object({
  firstName: firstNameField,
  lastName: lastNameField,
  displayName: displayNameField,
  jobTitle: jobTitleField,
  phone: phoneField,
  birthDate: birthDateField,
  cnpj: cnpjField,
  cep: cepField,
  street: streetField,
  streetNumber: streetNumberField,
  complement: complementField,
  neighborhood: neighborhoodField,
  city: cityField,
  state: stateField,
  instagram: instagramField,
  facebook: facebookField,
  tiktok: tiktokField,
  commissionServices: percentField,
  commissionProducts: percentField,
});

/** Criação: mesmos campos + e-mail do login (a senha é validada à parte). */
export const createBarberSchema = barberDetailsSchema.extend({ email: emailField });

/** Monta o jsonb `social` só com o que foi preenchido. */
export function buildSocial(v: {
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
}): Record<string, string> {
  const out: Record<string, string> = {};
  if (v.instagram) out.instagram = v.instagram;
  if (v.facebook) out.facebook = v.facebook;
  if (v.tiktok) out.tiktok = v.tiktok;
  return out;
}

/** Links de exibição a partir do jsonb `social`. */
export function socialLinks(social: unknown): { key: string; label: string; href: string; handle: string }[] {
  const s = (social && typeof social === "object" ? social : {}) as Record<string, unknown>;
  const defs = [
    { key: "instagram", label: "Instagram", base: "https://instagram.com/" },
    { key: "facebook", label: "Facebook", base: "https://facebook.com/" },
    { key: "tiktok", label: "TikTok", base: "https://tiktok.com/@" },
  ];
  return defs.flatMap((d) => {
    const handle = typeof s[d.key] === "string" ? (s[d.key] as string) : "";
    return handle ? [{ key: d.key, label: d.label, href: d.base + handle, handle }] : [];
  });
}

/** Iniciais para o avatar sem foto: "João da Silva" -> "JS". */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : "";
  return (first + last).toUpperCase();
}

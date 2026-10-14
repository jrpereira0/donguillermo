import { z } from "zod";

// ---------------- Categoria ----------------

// Ordem alfabética; "Outros" sempre por último.
export const SERVICE_CATEGORIES = [
  { value: "barba", label: "Barba" },
  { value: "cabelo", label: "Cabelo" },
  { value: "combo", label: "Combos" },
  { value: "massagem", label: "Massagem" },
  { value: "nariz", label: "Nariz" },
  { value: "orelha", label: "Orelha" },
  { value: "quimica", label: "Químicas" },
  { value: "sobrancelha", label: "Sobrancelhas" },
  { value: "tratamento", label: "Tratamentos" },
  { value: "unha", label: "Unhas" },
  { value: "outros", label: "Outros" },
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]["value"];

export const categoryLabel = (v: string | null | undefined) =>
  SERVICE_CATEGORIES.find((c) => c.value === v)?.label ?? "Outros";

export const categoryField = z.enum(SERVICE_CATEGORIES.map((c) => c.value) as [ServiceCategory, ...ServiceCategory[]], {
  error: "Escolha a categoria do serviço.",
});

// ---------------- Duração ----------------

/** Durações oferecidas no formulário (minutos). */
export const DURATIONS = [10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180] as const;

/** 30 -> "30 min", 60 -> "1h", 90 -> "1h30". */
export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export const durationField = z
  .string()
  .trim()
  .refine((v) => /^\d+$/.test(v) && (DURATIONS as readonly number[]).includes(Number(v)), "Escolha a duração do serviço.")
  .transform((v) => Number(v));

// ---------------- Preço ----------------

const MAX_CENTS = 10_000_000; // R$ 100.000,00

/**
 * "45", "45,5", "45,50", "1.250,00", "R$ 45,00" ou "45.50" -> centavos (4500). null se inválido.
 * Guardamos centavos inteiros: nenhum erro de arredondamento com dinheiro.
 */
export function moneyToCents(input: string): number | null {
  const t = input.replace(/R\$|\s/g, "");
  let n: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) n = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d{1,2})?$/.test(t)) n = t.replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(t)) n = t;
  else return null;
  const cents = Math.round(Number(n) * 100);
  return Number.isFinite(cents) && cents >= 0 && cents <= MAX_CENTS ? cents : null;
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** 125000 -> "1.250,00" (para campo de texto). */
export const centsToInput = (cents: number) => `${group(Math.floor(cents / 100))},${String(cents % 100).padStart(2, "0")}`;

/** 125000 -> "R$ 1.250,00" (exibição). */
export const formatBRL = (cents: number) => `R$ ${centsToInput(cents)}`;

/**
 * Máscara de dinheiro enquanto digita: só os dígitos contam e entram pela direita
 * ("4" -> "0,04", "450" -> "4,50", "4500" -> "45,00"). Vazio fica vazio.
 */
export function maskMoney(input: string | null | undefined): string {
  const digits = (input ?? "").replace(/\D/g, "").slice(0, 9);
  if (!digits) return "";
  return centsToInput(Math.min(Number(digits), MAX_CENTS));
}

/** Mensagem de erro do preço digitado, ou null se vazio/válido. */
export function priceProblem(v: string): string | null {
  if (v.trim() === "") return null;
  return moneyToCents(v) === null ? "Preço inválido. Ex.: 45,00." : null;
}

export const priceField = z
  .string()
  .trim()
  .min(1, "Informe o preço (use 0,00 para serviço sem custo).")
  .refine((v) => moneyToCents(v) !== null, "Preço inválido. Ex.: 45,00.")
  .transform((v) => moneyToCents(v) as number);

// ---------------- Campos de texto ----------------

export const serviceNameField = z
  .string()
  .trim()
  .min(2, "Informe o nome do serviço.")
  .max(80, "Nome muito longo (máx. 80 caracteres).");

export const serviceDescriptionField = z
  .string()
  .trim()
  .max(300, "Descrição muito longa (máx. 300 caracteres).")
  .transform((v) => (v === "" ? null : v));

// ---------------- Schema ----------------

export const serviceSchema = z.object({
  name: serviceNameField,
  category: categoryField,
  description: serviceDescriptionField,
  duration: durationField,
  price: priceField,
});

import { z } from "zod";
import { moneyToCents } from "@/lib/validation/service";

export const PRODUCT_CATEGORIES = [
  { value: "barba", label: "Barba" },
  { value: "cabelo", label: "Cabelo" },
  { value: "pele", label: "Pele" },
  { value: "perfume", label: "Perfume" },
  { value: "outros", label: "Outros" },
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]["value"];

export const productCategoryLabel = (v: string | null | undefined) =>
  PRODUCT_CATEGORIES.find((c) => c.value === v)?.label ?? "Outros";

const categoryField = z.enum(PRODUCT_CATEGORIES.map((c) => c.value) as [ProductCategory, ...ProductCategory[]], {
  error: "Escolha a categoria do produto.",
});

export const productSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do produto.").max(80, "Nome muito longo (máx. 80 caracteres)."),
  category: categoryField,
  description: z
    .string()
    .trim()
    .max(300, "Descrição muito longa (máx. 300 caracteres).")
    .transform((v) => (v === "" ? null : v)),
  price: z
    .string()
    .trim()
    .min(1, "Informe o preço (use 0,00 para produto sem custo).")
    .refine((v) => moneyToCents(v) !== null, "Preço inválido. Ex.: 45,00.")
    .transform((v) => moneyToCents(v) as number),
});

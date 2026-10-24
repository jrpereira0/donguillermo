import { Brush, Droplets, Scissors, SprayCan, Tag, type LucideIcon } from "lucide-react";
import { PRODUCT_CATEGORIES } from "@/lib/validation/product";
import type { SelectOption } from "@/components/ui/select";

/** Ícone de linha de cada categoria (formulário e lista). */
export const PRODUCT_ICONS: Record<string, LucideIcon> = {
  barba: Brush,
  cabelo: Scissors,
  pele: Droplets,
  perfume: SprayCan,
  outros: Tag,
};

export const productIcon = (category: string): LucideIcon => PRODUCT_ICONS[category] ?? Tag;

export const PRODUCT_CATEGORY_OPTIONS: SelectOption[] = PRODUCT_CATEGORIES.map((c) => ({
  value: c.value,
  label: c.label,
  icon: PRODUCT_ICONS[c.value],
}));

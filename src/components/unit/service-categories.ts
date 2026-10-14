import { Brush, Droplets, Ear, Eye, FlaskConical, Hand, Layers, Scissors, Tag, Waves, Wind, type LucideIcon } from "lucide-react";
import { SERVICE_CATEGORIES } from "@/lib/validation/service";
import type { SelectOption } from "@/components/ui/select";

/** Ícone de linha de cada categoria (formulário e lista). */
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  cabelo: Scissors,
  barba: Brush,
  combo: Layers,
  quimica: FlaskConical,
  sobrancelha: Eye,
  unha: Hand,
  nariz: Wind,
  orelha: Ear,
  massagem: Waves,
  tratamento: Droplets,
  outros: Tag,
};

export const serviceIcon = (category: string): LucideIcon => SERVICE_ICONS[category] ?? Tag;

export const CATEGORY_OPTIONS: SelectOption[] = SERVICE_CATEGORIES.map((c) => ({
  value: c.value,
  label: c.label,
  icon: SERVICE_ICONS[c.value],
}));

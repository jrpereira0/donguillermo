import type { FormState } from "@/lib/validation/auth";

export const PRODUCT_COLUMNS = "id, unit_id, name, description, category, price_cents, is_active, created_at, updated_at";

export type ProductRow = {
  id: string;
  unit_id: string;
  name: string;
  description: string | null;
  category: string;
  price_cents: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductFormState = FormState & { values?: Record<string, string> };

export const initialProductState: ProductFormState = { status: "idle" };

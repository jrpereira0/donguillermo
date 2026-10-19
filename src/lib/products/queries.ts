import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_COLUMNS, type ProductRow } from "./types";

export async function listProducts(unitId: string): Promise<ProductRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("unit_id", unitId)
    .order("is_active", { ascending: false })
    .order("name")
    .limit(200)
    .returns<ProductRow[]>();
  if (error) {
    console.error("[products] list:", error.code);
    return [];
  }
  return data ?? [];
}

export async function getProduct(unitId: string, id: string): Promise<ProductRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("unit_id", unitId)
    .eq("id", id)
    .maybeSingle<ProductRow>();
  if (error) console.error("[products] get:", error.code);
  return data ?? null;
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUnitArea } from "@/lib/auth/guards";
import { collectValues } from "@/lib/barbers/form";
import type { ProductFormState } from "@/lib/products/types";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors } from "@/lib/validation/auth";
import { productSchema } from "@/lib/validation/product";

const ONE_HOUR = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC = "Não foi possível concluir a operação. Tente novamente.";
const CHECK = "Confira os campos destacados.";
const DUPLICATE = "Já existe um produto com este nome nesta unidade.";

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function throttled(userId: string, limit: number): ProductFormState | null {
  const r = rateLimit(`produtos:${userId}`, limit, ONE_HOUR);
  if (r.ok) return null;
  return {
    status: "error",
    message: `Muitas operações seguidas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.`,
  };
}

const detailsFrom = (form: FormData) => ({
  name: str(form, "name"),
  category: str(form, "category"),
  description: str(form, "description"),
  price: str(form, "price"),
});

export async function createProductAction(
  slug: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "produtos");
  const values = collectValues(formData);
  const limited = throttled(ctx.userId, 120);
  if (limited) return { ...limited, values };

  const parsed = productSchema.safeParse(detailsFrom(formData));
  if (!parsed.success) {
    return { status: "error", message: CHECK, values, fieldErrors: toFieldErrors(parsed.error) };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    unit_id: unit.id,
    name: v.name,
    description: v.description,
    category: v.category,
    price_cents: v.price,
  });
  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: CHECK, values, fieldErrors: { name: DUPLICATE } };
    }
    console.error("[products] insert:", error.code);
    return { status: "error", message: GENERIC, values };
  }

  revalidatePath(`/u/${unit.slug}/produtos`);
  revalidatePath(`/u/${unit.slug}/agenda`);
  redirect(`/u/${unit.slug}/produtos?aviso=criado`);
}

export async function updateProductAction(
  slug: string,
  productId: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "produtos");
  const values = collectValues(formData);
  const limited = throttled(ctx.userId, 180);
  if (limited) return { ...limited, values };
  if (!UUID.test(productId)) return { status: "error", message: GENERIC, values };

  const parsed = productSchema.safeParse(detailsFrom(formData));
  if (!parsed.success) {
    return { status: "error", message: CHECK, values, fieldErrors: toFieldErrors(parsed.error) };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      name: v.name,
      description: v.description,
      category: v.category,
      price_cents: v.price,
    })
    .eq("id", productId)
    .eq("unit_id", unit.id);
  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: CHECK, values, fieldErrors: { name: DUPLICATE } };
    }
    console.error("[products] update:", error.code);
    return { status: "error", message: GENERIC, values };
  }

  revalidatePath(`/u/${unit.slug}/produtos`);
  revalidatePath(`/u/${unit.slug}/agenda`);
  return { status: "success", message: "Alterações salvas.", values };
}

export async function toggleProductActiveAction(slug: string, productId: string, active: boolean): Promise<void> {
  const { ctx, unit } = await requireUnitArea(slug, "produtos");
  if (!UUID.test(productId) || throttled(ctx.userId, 240)) return;

  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ is_active: active }).eq("id", productId).eq("unit_id", unit.id);
  if (error) console.error("[products] toggle:", error.code);

  revalidatePath(`/u/${unit.slug}/produtos`);
  revalidatePath(`/u/${unit.slug}/agenda`);
}

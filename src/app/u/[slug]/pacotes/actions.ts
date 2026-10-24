"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUnitArea } from "@/lib/auth/guards";
import { packageEffectiveDiscountPct } from "@/lib/packages/math";
import { getPackage, listCustomerPackages } from "@/lib/packages/queries";
import type { PackageFormState } from "@/lib/packages/types";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors, type FormState } from "@/lib/validation/auth";
import { packageItemInputSchema, packageSchema } from "@/lib/validation/package";

const ONE_HOUR = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC = "Não foi possível concluir a operação. Tente novamente.";
const CHECK = "Confira os campos destacados.";
const DUPLICATE = "Já existe um pacote com este nome nesta unidade.";

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function throttled(userId: string, limit: number): FormState | null {
  const r = rateLimit(`pacotes:${userId}`, limit, ONE_HOUR);
  if (r.ok) return null;
  return { status: "error", message: `Muitas operações seguidas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.` };
}

function readItems(form: FormData): { serviceId: string; quantity: number }[] | null {
  try {
    const parsed = z.array(packageItemInputSchema).min(1).max(20).safeParse(JSON.parse(str(form, "items") || "[]"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function saveItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  packageId: string,
  items: { serviceId: string; quantity: number }[],
): Promise<boolean> {
  const { error: delError } = await supabase.from("package_items").delete().eq("package_id", packageId).eq("unit_id", unitId);
  if (delError) return false;
  const { error } = await supabase.from("package_items").insert(
    items.map((i, idx) => ({ package_id: packageId, unit_id: unitId, service_id: i.serviceId, quantity: i.quantity, position: idx })),
  );
  return !error;
}

function readPackageForm(formData: FormData) {
  const values: Record<string, string> = {
    name: str(formData, "name"),
    description: str(formData, "description"),
    priceMode: str(formData, "priceMode"),
    discountPct: str(formData, "discountPct"),
    fixedPrice: str(formData, "fixedPrice"),
    validityDays: str(formData, "validityDays"),
    items: str(formData, "items"),
  };
  const parsed = packageSchema.safeParse({
    name: values.name,
    description: values.description,
    priceMode: values.priceMode,
    discountPct: values.discountPct,
    fixedPrice: values.fixedPrice,
    validityDays: values.validityDays,
  });
  return { values, parsed };
}

/** Soma cheia dos serviços escolhidos; null se algum não é desta unidade. */
async function listTotalCents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  items: { serviceId: string; quantity: number }[],
): Promise<number | null> {
  const { data: svcs } = await supabase
    .from("services")
    .select("id, price_cents")
    .eq("unit_id", unitId)
    .in("id", items.map((i) => i.serviceId))
    .returns<{ id: string; price_cents: number }[]>();
  if ((svcs ?? []).length !== items.length) return null;
  const priceById = new Map((svcs ?? []).map((s) => [s.id, s.price_cents]));
  return items.reduce((n, i) => n + i.quantity * (priceById.get(i.serviceId) ?? 0), 0);
}

export async function createPackageAction(slug: string, _prev: PackageFormState, formData: FormData): Promise<PackageFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "pacotes");
  const limited = throttled(ctx.userId, 120);
  if (limited) return limited;

  const { values, parsed } = readPackageForm(formData);
  const items = readItems(formData);
  if (!parsed.success) {
    return { status: "error", message: CHECK, values, fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!items) {
    return { status: "error", message: CHECK, values, fieldErrors: { items: "Escolha pelo menos um serviço para o pacote." } };
  }

  const supabase = await createClient();
  const listCents = await listTotalCents(supabase, unit.id, items);
  if (listCents === null) {
    return { status: "error", message: CHECK, values, fieldErrors: { items: "Um dos serviços não pertence a esta unidade." } };
  }
  // No modo fixo, o desconto gravado é o implícito (foto coerente para exibição).
  const discountPct =
    parsed.data.priceMode === "fixo"
      ? packageEffectiveDiscountPct(listCents, parsed.data.fixedPriceCents ?? 0)
      : parsed.data.discountPct;
  if (parsed.data.priceMode === "fixo" && (parsed.data.fixedPriceCents ?? 0) > listCents) {
    return {
      status: "error",
      message: CHECK,
      values,
      fieldErrors: { fixedPrice: "O valor fixo não pode passar da soma dos serviços do pacote." },
    };
  }

  const { data, error } = await supabase
    .from("packages")
    .insert({
      unit_id: unit.id,
      name: parsed.data.name,
      description: parsed.data.description,
      discount_pct: discountPct,
      price_mode: parsed.data.priceMode,
      fixed_price_cents: parsed.data.fixedPriceCents,
      validity_days: parsed.data.validityDays,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { status: "error", message: CHECK, values, fieldErrors: { name: DUPLICATE } };
    }
    console.error("[packages] insert:", error?.code);
    return { status: "error", message: GENERIC, values };
  }
  if (!(await saveItems(supabase, unit.id, data.id, items))) {
    return { status: "error", message: GENERIC, values };
  }

  revalidatePath(`/u/${unit.slug}/pacotes`);
  redirect(`/u/${unit.slug}/pacotes?aviso=criado`);
}

export async function updatePackageAction(
  slug: string,
  packageId: string,
  _prev: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "pacotes");
  const limited = throttled(ctx.userId, 180);
  if (limited) return limited;
  if (!UUID.test(packageId)) return { status: "error", message: GENERIC };

  const { values, parsed } = readPackageForm(formData);
  const items = readItems(formData);
  if (!parsed.success) {
    return { status: "error", message: CHECK, values, fieldErrors: toFieldErrors(parsed.error) };
  }
  if (!items) {
    return { status: "error", message: CHECK, values, fieldErrors: { items: "Escolha pelo menos um serviço para o pacote." } };
  }

  const supabase = await createClient();
  const listCents = await listTotalCents(supabase, unit.id, items);
  if (listCents === null) {
    return { status: "error", message: CHECK, values, fieldErrors: { items: "Um dos serviços não pertence a esta unidade." } };
  }
  const discountPct =
    parsed.data.priceMode === "fixo"
      ? packageEffectiveDiscountPct(listCents, parsed.data.fixedPriceCents ?? 0)
      : parsed.data.discountPct;
  if (parsed.data.priceMode === "fixo" && (parsed.data.fixedPriceCents ?? 0) > listCents) {
    return {
      status: "error",
      message: CHECK,
      values,
      fieldErrors: { fixedPrice: "O valor fixo não pode passar da soma dos serviços do pacote." },
    };
  }

  const { error } = await supabase
    .from("packages")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      discount_pct: discountPct,
      price_mode: parsed.data.priceMode,
      fixed_price_cents: parsed.data.fixedPriceCents,
      validity_days: parsed.data.validityDays,
    })
    .eq("id", packageId)
    .eq("unit_id", unit.id);
  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: CHECK, values, fieldErrors: { name: DUPLICATE } };
    }
    console.error("[packages] update:", error.code);
    return { status: "error", message: GENERIC, values };
  }
  if (!(await saveItems(supabase, unit.id, packageId, items))) {
    return { status: "error", message: GENERIC, values };
  }

  revalidatePath(`/u/${unit.slug}/pacotes`);
  revalidatePath(`/u/${unit.slug}/pacotes/${packageId}`);
  return { status: "success", message: "Alterações salvas.", values };
}

export async function togglePackageActiveAction(slug: string, packageId: string, active: boolean): Promise<void> {
  const { ctx, unit } = await requireUnitArea(slug, "pacotes");
  if (!UUID.test(packageId) || throttled(ctx.userId, 240)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("packages").update({ is_active: active }).eq("id", packageId).eq("unit_id", unit.id);
  if (error) console.error("[packages] toggle:", error.code);
  revalidatePath(`/u/${unit.slug}/pacotes`);
}

/**
 * Vende o pacote para o cliente: cria o pacote dele (pendente), a comanda da
 * venda com o item do pacote e manda para a comanda cobrar. Ao cobrar, o
 * banco ativa o pacote (trigger). Preço e serviços são foto do catálogo agora.
 */
export async function sellPackageAction(slug: string, customerId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, unit } = await requireUnitArea(slug, "pacotes");
  const limited = throttled(ctx.userId, 120);
  if (limited) return limited;
  if (!UUID.test(customerId)) return { status: "error", message: GENERIC };
  const packageId = str(formData, "packageId");
  if (!UUID.test(packageId)) return { status: "error", message: "Escolha o pacote para vender." };

  const supabase = await createClient();
  const [pkg, customer] = await Promise.all([
    getPackage(unit.id, packageId),
    supabase.from("customers").select("id, full_name, is_active").eq("id", customerId).maybeSingle<{ id: string; full_name: string; is_active: boolean }>(),
  ]);
  if (!pkg || !pkg.isActive || pkg.items.length === 0) return { status: "error", message: "Pacote não encontrado ou desativado." };
  if (!customer.data) return { status: "error", message: "Cliente não encontrado." };

  const price = pkg.priceCents;

  const { data: cp, error: cpError } = await supabase
    .from("customer_packages")
    .insert({
      unit_id: unit.id,
      customer_id: customerId,
      package_id: pkg.id,
      package_name: pkg.name,
      discount_pct: pkg.discountPct,
      list_cents: pkg.listCents,
      price_cents: price,
      validity_days: pkg.validityDays,
      status: "pendente",
    })
    .select("id")
    .single();
  if (cpError || !cp) {
    console.error("[packages] sell cp:", cpError?.code);
    return { status: "error", message: GENERIC };
  }

  const { error: itemsError } = await supabase.from("customer_package_items").insert(
    pkg.items.map((i) => ({
      customer_package_id: cp.id,
      unit_id: unit.id,
      service_id: i.serviceId,
      service_name: i.serviceName,
      quantity_total: i.quantity,
      unit_price_cents: i.unitPriceCents,
    })),
  );
  if (itemsError) {
    console.error("[packages] sell items:", itemsError.code);
    return { status: "error", message: GENERIC };
  }

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .insert({
      unit_id: unit.id,
      customer_id: customerId,
      customer_name: customer.data.full_name,
      notes: `Venda do pacote ${pkg.name}`,
    })
    .select("id")
    .single();
  if (ticketError || !ticket) {
    console.error("[packages] sell ticket:", ticketError?.code);
    return { status: "error", message: GENERIC };
  }

  const { error: lineError } = await supabase.from("ticket_items").insert({
    ticket_id: ticket.id,
    unit_id: unit.id,
    position: 0,
    kind: "pacote",
    service_id: null,
    name: pkg.name,
    quantity: 1,
    unit_price_cents: price,
    customer_package_id: cp.id,
    package_id: pkg.id,
  });
  if (lineError) {
    console.error("[packages] sell line:", lineError.code);
    return { status: "error", message: GENERIC };
  }

  await supabase.from("customer_packages").update({ sold_ticket_id: ticket.id }).eq("id", cp.id).eq("unit_id", unit.id);

  revalidatePath(`/u/${slug}/clientes/${customerId}`);
  revalidatePath(`/u/${slug}/caixa`);
  redirect(`/u/${slug}/caixa/comanda/${ticket.id}`);
}

/** Cancela o pacote do cliente (só sem nenhum uso; estorno do valor é manual no caixa). */
export async function cancelCustomerPackageAction(slug: string, customerPackageId: string): Promise<void> {
  const { unit } = await requireUnitArea(slug, "pacotes");
  if (!UUID.test(customerPackageId)) return;
  const supabase = await createClient();
  const { data: cp } = await supabase
    .from("customer_packages")
    .select("id, customer_id, status, sold_ticket_id")
    .eq("id", customerPackageId)
    .eq("unit_id", unit.id)
    .maybeSingle<{ id: string; customer_id: string; status: string; sold_ticket_id: string | null }>();
  if (!cp || cp.status === "cancelada") return;

  const [mine] = (await listCustomerPackages(unit.id, cp.customer_id)).filter((p) => p.id === cp.id);
  if (!mine || mine.usedServices > 0) return;

  if (cp.status === "pendente" && cp.sold_ticket_id) {
    await supabase
      .from("tickets")
      .update({ status: "cancelada" })
      .eq("id", cp.sold_ticket_id)
      .eq("unit_id", unit.id)
      .eq("status", "aberta");
  }
  await supabase.from("customer_packages").update({ status: "cancelada" }).eq("id", cp.id).eq("unit_id", unit.id);

  revalidatePath(`/u/${slug}/clientes/${cp.customer_id}`);
  revalidatePath(`/u/${slug}/caixa`);
}

/** Abre uma comanda avulsa para o cliente (para usar os serviços do pacote). */
export async function startCustomerTicketAction(slug: string, customerId: string): Promise<void> {
  const { unit } = await requireUnitArea(slug, "caixa");
  if (!UUID.test(customerId)) redirect(`/u/${slug}/clientes`);
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("full_name")
    .eq("id", customerId)
    .maybeSingle<{ full_name: string }>();
  if (!customer) redirect(`/u/${slug}/clientes`);
  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({ unit_id: unit.id, customer_id: customerId, customer_name: customer!.full_name })
    .select("id")
    .single();
  if (error || !ticket) redirect(`/u/${slug}/caixa`);
  revalidatePath(`/u/${slug}/caixa`);
  redirect(`/u/${slug}/caixa/comanda/${ticket!.id}`);
}

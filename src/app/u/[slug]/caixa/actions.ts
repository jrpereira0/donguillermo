"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUnitArea } from "@/lib/auth/guards";
import { expectedCash, PAY_METHODS, type PayMethod } from "@/lib/caixa/math";
import { getOpenRegister, getTicket, listCatalog } from "@/lib/caixa/queries";
import type { CatalogBarber, CatalogProduct, CatalogService, TicketDetail, TicketPackageOption, TicketPackageSaleOption } from "@/lib/caixa/types";
import { packageServiceShareCents } from "@/lib/packages/math";
import { getPackage, listCustomerPackages, listPackages } from "@/lib/packages/queries";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/validation/auth";
import { formatBRL, moneyToCents } from "@/lib/validation/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GENERIC = "Não foi possível concluir. Tente novamente.";
const ONE_HOUR = 60 * 60_000;

const lineSchema = z.object({
  kind: z.enum(["servico", "produto", "pacote"]),
  serviceId: z.string().regex(UUID).nullable(),
  name: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1).max(20),
  unitPriceCents: z.number().int().min(0).max(10_000_000),
  barberId: z.string().regex(UUID).nullable(),
  customerPackageId: z.string().regex(UUID).nullable().optional(),
  packageId: z.string().regex(UUID).nullable().optional(),
});
const paySchema = z.object({
  method: z.enum(PAY_METHODS.map((m) => m.value) as [PayMethod, ...PayMethod[]]),
  amountCents: z.number().int().min(1).max(100_000_000),
  installments: z.number().int().min(1).max(12).optional(),
});
const tipSchema = z.object({
  barberId: z.string().regex(UUID),
  amountCents: z.number().int().min(1).max(10_000_000),
});

function fail(message: string): FormState {
  return { status: "error", message };
}

function throttled(userId: string): FormState | null {
  const r = rateLimit(`caixa:${userId}`, 400, ONE_HOUR);
  if (r.ok) return null;
  return fail(`Muitas operações seguidas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.`);
}

function businessDateSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function mapRpc(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "Já existe um caixa aberto nesta unidade.";
  if (error.code === "P0001") return error.message || "Não foi possível concluir.";
  if (error.code === "P0002") return error.message || "Registro não encontrado.";
  if (error.code === "22023") return error.message || "Dados inválidos.";
  return GENERIC;
}

function readPayload(formData: FormData) {
  let items: unknown = [];
  let payments: unknown = [];
  let tips: unknown = [];
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
    payments = JSON.parse(String(formData.get("payments") ?? "[]"));
    tips = JSON.parse(String(formData.get("tips") ?? "[]"));
  } catch {
    return null;
  }
  const lines = z.array(lineSchema).max(30).safeParse(items);
  const pays = z.array(paySchema).max(6).safeParse(payments);
  const tipRows = z.array(tipSchema).max(6).safeParse(tips);
  const discount = moneyToCents(String(formData.get("discount") ?? "0")) ?? 0;
  const tip = tipRows.success ? tipRows.data.reduce((n, t) => n + t.amountCents, 0) : 0;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);
  const barberRaw = String(formData.get("barberId") ?? "");
  const barberId = UUID.test(barberRaw) ? barberRaw : null;
  if (!lines.success || !pays.success || !tipRows.success) return null;
  return {
    discount,
    tip,
    notes,
    barberId,
    items: lines.data.map((l) => ({
      kind: l.kind,
      service_id: l.kind === "servico" ? l.serviceId : null,
      name: l.name,
      quantity: l.quantity,
      unit_price_cents: l.unitPriceCents,
      barber_id: l.barberId,
      customer_package_id: l.customerPackageId ?? null,
      package_id: l.packageId ?? null,
    })),
    tips: tipRows.data.map((t) => ({ barber_id: t.barberId, amount_cents: t.amountCents })),
    payments: pays.data.map((p) => ({
      method: p.method,
      amount_cents: p.amountCents,
      installments: p.method === "credito" ? (p.installments ?? 1) : 1,
    })),
  };
}

function touch(slug: string) {
  revalidatePath(`/u/${slug}/caixa`);
  revalidatePath(`/u/${slug}/caixa/historico`);
  revalidatePath(`/u/${slug}/agenda`);
  revalidatePath(`/u/${slug}/clientes`);
  // Fichas abertas precisam refletir na hora o saldo do pacote baixado na comanda.
  revalidatePath(`/u/${slug}/clientes/[id]`, "page");
}

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(
    new Date(`${iso}T12:00:00`),
  );

export async function openRegisterAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, unit } = await requireUnitArea(slug, "caixa");
  const limited = throttled(ctx.userId);
  if (limited) return limited;
  const opening = moneyToCents(String(formData.get("opening") ?? "0"));
  if (opening === null) return fail("Informe o fundo de caixa. Ex.: 100,00.");

  // O dia do caixa é escolhido na abertura — um caixa por dia, sempre novo.
  const day = String(formData.get("businessDate") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(new Date(`${day}T12:00:00`).getTime())) {
    return fail("Escolha o dia do caixa.");
  }
  const maxDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + 7 * 86_400_000),
  );
  if (day < "2024-01-01" || day > maxDay) return fail("Escolha um dia válido para o caixa (até 7 dias à frente).");

  const supabase = await createClient();
  const open = await getOpenRegister(unit.id);
  if (open) {
    return fail(
      `Já existe um caixa aberto (referente a ${dayLabel(open.businessDate)}). Feche esse caixa antes de abrir outro.`,
    );
  }
  const { data: sameDay } = await supabase
    .from("cash_registers")
    .select("id, status")
    .eq("unit_id", unit.id)
    .eq("business_date", day)
    .maybeSingle();
  if (sameDay) {
    return fail(
      sameDay.status === "aberto"
        ? `Já existe um caixa aberto para ${dayLabel(day)}.`
        : `Já existe um caixa fechado para ${dayLabel(day)}. Não dá para abrir outro do mesmo dia — reabra aquele: no histórico, toque nesse dia e em "Reabrir caixa".`,
    );
  }

  const { error } = await supabase.from("cash_registers").insert({
    unit_id: unit.id,
    business_date: day,
    opening_cents: opening,
  });
  if (error) {
    console.error("[caixa] open:", error.code);
    if (error.code === "23505") {
      return fail("Já existe um caixa aberto ou um caixa para este dia nesta unidade.");
    }
    return fail(mapRpc(error));
  }
  touch(slug);
  return { status: "success", message: "Caixa aberto." };
}

export async function closeRegisterAction(slug: string, registerId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, unit } = await requireUnitArea(slug, "caixa");
  const limited = throttled(ctx.userId);
  if (limited) return limited;
  if (!UUID.test(registerId)) return fail(GENERIC);
  const counted = moneyToCents(String(formData.get("counted") ?? ""));
  if (counted === null) return fail("Informe o dinheiro contado na gaveta.");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_cash_register", {
    p_id: registerId,
    p_counted: counted,
    p_notes: notes,
  });
  if (error) {
    console.error("[caixa] close:", error.code);
    return fail(mapRpc(error));
  }
  void unit;
  touch(slug);
  return { status: "success", message: "Caixa fechado." };
}

export async function reopenRegisterAction(slug: string, registerId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { ctx, unit } = await requireUnitArea(slug, "caixa");
  const limited = throttled(ctx.userId);
  if (limited) return limited;
  if (!UUID.test(registerId)) return fail(GENERIC);
  void unit;

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_cash_register", { p_id: registerId });
  if (error) {
    console.error("[caixa] reopen register:", error.code);
    return fail(mapRpc(error));
  }
  touch(slug);
  redirect(`/u/${slug}/caixa`);
}

export async function cashMovementAction(slug: string, registerId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, unit } = await requireUnitArea(slug, "caixa");
  const limited = throttled(ctx.userId);
  if (limited) return limited;
  if (!UUID.test(registerId)) return fail(GENERIC);
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "sangria" && kind !== "suprimento") return fail("Escolha sangria ou suprimento.");
  const amount = moneyToCents(String(formData.get("amount") ?? ""));
  if (amount === null || amount < 1) return fail("Informe o valor.");
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);

  const supabase = await createClient();
  const { data: reg } = await supabase
    .from("cash_registers")
    .select("id, opening_cents")
    .eq("id", registerId)
    .eq("unit_id", unit.id)
    .eq("status", "aberto")
    .maybeSingle<{ id: string; opening_cents: number }>();
  if (!reg) return fail("O caixa não está aberto.");

  if (kind === "sangria") {
    // A sangria não pode passar do dinheiro que há na gaveta (fundo +
    // suprimentos − sangrias + vendas em dinheiro). O gatilho no banco é a
    // última linha; aqui a mensagem já vem com o valor disponível.
    const [{ data: movs }, { data: pays }] = await Promise.all([
      supabase.from("cash_movements").select("kind, amount_cents").eq("register_id", registerId).limit(1000),
      supabase.from("ticket_payments").select("amount_cents").eq("register_id", registerId).eq("method", "dinheiro").limit(2000),
    ]);
    const sum = (rows: { amount_cents: number }[] | null) => (rows ?? []).reduce((n, r) => n + r.amount_cents, 0);
    const esperado = expectedCash({
      openingCents: reg.opening_cents,
      suprimentoCents: sum((movs ?? []).filter((m) => m.kind === "suprimento")),
      sangriaCents: sum((movs ?? []).filter((m) => m.kind === "sangria")),
      dinheiroCents: sum(pays),
    });
    if (amount > esperado) {
      return fail(`A sangria não pode passar do dinheiro na gaveta (${formatBRL(esperado)}).`);
    }
  }

  const { error } = await supabase.from("cash_movements").insert({
    register_id: registerId,
    unit_id: unit.id,
    kind,
    amount_cents: amount,
    note: note || null,
  });
  if (error) {
    console.error("[caixa] movement:", error.code);
    if (error.code === "22023") return fail("A sangria não pode passar do dinheiro na gaveta.");
    return fail(GENERIC);
  }
  touch(slug);
  return { status: "success", message: kind === "sangria" ? "Sangria registrada." : "Suprimento registrado." };
}

export async function createTicketAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, unit } = await requireUnitArea(slug, "caixa");
  const limited = throttled(ctx.userId);
  if (limited) return limited;
  const name = String(formData.get("customerName") ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return fail("Informe o nome do cliente.");
  const barberRaw = String(formData.get("barberId") ?? "");
  const barberId = UUID.test(barberRaw) ? barberRaw : null;

  const supabase = await createClient();
  let barberName: string | null = null;
  if (barberId) {
    const { data: b } = await supabase
      .from("barbers")
      .select("display_name")
      .eq("id", barberId)
      .eq("unit_id", unit.id)
      .maybeSingle<{ display_name: string }>();
    if (!b) return fail("Profissional não encontrado.");
    barberName = b.display_name;
  }

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      unit_id: unit.id,
      customer_name: name,
      barber_id: barberId,
      barber_name: barberName,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[caixa] new ticket:", error?.code);
    return fail(GENERIC);
  }
  touch(slug);
  redirect(`/u/${slug}/caixa/comanda/${data.id}`);
}

export async function openTicketFromAppointmentAction(slug: string, appointmentId: string) {
  const { unit } = await requireUnitArea(slug, "caixa");
  if (!UUID.test(appointmentId)) redirect(`/u/${slug}/agenda`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_ticket_from_appointment", { p_appointment: appointmentId });
  if (error || !data) {
    console.error("[caixa] from appointment:", error?.code);
    redirect(`/u/${slug}/agenda`);
  }
  void unit;
  redirect(`/u/${slug}/caixa/comanda/${data as string}`);
}

export async function saveTicketAction(slug: string, ticketId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, unit } = await requireUnitArea(slug, "caixa");
  const limited = throttled(ctx.userId);
  if (limited) return limited;
  if (!UUID.test(ticketId)) return fail(GENERIC);
  const payload = readPayload(formData);
  if (!payload) return fail("Confira os itens da comanda.");

  const supabase = await createClient();
  const sold = await materializePackageSales(supabase, unit.id, ticketId, payload.items);
  if ("error" in sold) return fail(sold.error);
  const items = await applyPackageProductionPrice(supabase, unit.id, sold.items);
  const { error } = await supabase.rpc("save_open_ticket", {
    p_id: ticketId,
    p_discount: payload.discount,
    p_tip: payload.tip,
    p_notes: payload.notes,
    p_barber: payload.barberId,
    p_items: items,
    p_tips: payload.tips,
  });
  if (error) {
    console.error("[caixa] save ticket:", error.code);
    return fail(mapRpc(error));
  }
  touch(slug);
  revalidatePath(`/u/${slug}/caixa/comanda/${ticketId}`);
  return { status: "success", message: "Comanda salva." };
}

export async function chargeTicketAction(slug: string, ticketId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, unit } = await requireUnitArea(slug, "caixa");
  const limited = throttled(ctx.userId);
  if (limited) return limited;
  if (!UUID.test(ticketId)) return fail(GENERIC);
  const payload = readPayload(formData);
  if (!payload || payload.items.length === 0) return fail("Adicione pelo menos um item.");

  const supabase = await createClient();
  const sold = await materializePackageSales(supabase, unit.id, ticketId, payload.items);
  if ("error" in sold) return fail(sold.error);
  const items = await applyPackageProductionPrice(supabase, unit.id, sold.items);
  const { error } = await supabase.rpc("charge_ticket", {
    p_id: ticketId,
    p_discount: payload.discount,
    p_tip: payload.tip,
    p_barber: payload.barberId,
    p_items: items,
    p_payments: payload.payments,
    p_tips: payload.tips,
  });
  if (error) {
    console.error("[caixa] charge:", error.code);
    return fail(mapRpc(error));
  }
  touch(slug);
  revalidatePath(`/u/${slug}/caixa/comanda/${ticketId}`);
  return { status: "success", message: "Pagamento registrado. Comanda fechada." };
}

/** Reabre uma comanda cobrada: desfaz os pagamentos e volta o agendamento. */
export async function reopenTicketAction(slug: string, ticketId: string, _prev: FormState, _formData: FormData): Promise<FormState> {
  const { ctx } = await requireUnitArea(slug, "caixa");
  const limited = throttled(ctx.userId);
  if (limited) return limited;
  if (!UUID.test(ticketId)) return fail(GENERIC);

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_ticket", { p_id: ticketId });
  if (error) {
    console.error("[caixa] reopen:", error.code);
    return fail(mapRpc(error));
  }
  touch(slug);
  revalidatePath(`/u/${slug}/caixa/comanda/${ticketId}`);
  return { status: "success", message: "Comanda reaberta. Os pagamentos foram desfeitos." };
}

export type ComandaLoad =
  | {
      ok: true;
      ticket: TicketDetail;
      services: CatalogService[];
      products: CatalogProduct[];
      barbers: CatalogBarber[];
      registerOpen: boolean;
      registerDay: string | null;
      packages: TicketPackageOption[];
      salePackages: TicketPackageSaleOption[];
    }
  | { ok: false; message: string };

/** Catálogo vendável na comanda (pacotes ativos com serviços). */
export async function salePackageOptions(unitId: string): Promise<TicketPackageSaleOption[]> {
  const catalog = await listPackages(unitId);
  return catalog
    .filter((p) => p.isActive && p.items.length > 0)
    .map((p) => ({
      packageId: p.id,
      name: p.name,
      priceCents: p.priceCents,
      listCents: p.listCents,
      discountPct: p.discountPct,
      totalServices: p.items.reduce((n, i) => n + i.quantity, 0),
      items: p.items.map((i) => ({
        serviceId: i.serviceId,
        serviceName: i.serviceName,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
      })),
    }));
}

type PayloadItem = NonNullable<ReturnType<typeof readPayload>>["items"][number];

/**
 * Venda de pacote dentro da comanda: para cada item "pacote" ainda sem o pacote
 * do cliente, cria o pacote dele (pendente, foto do catálogo) ligado a esta
 * comanda — ao cobrar, o banco ativa. Reaproveita vendas pendentes desta
 * comanda (salvar de novo não duplica) e cancela as que saíram da comanda.
 */
async function materializePackageSales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  ticketId: string,
  items: PayloadItem[],
): Promise<{ items: PayloadItem[] } | { error: string }> {
  const saleLines = items.filter((i) => i.kind === "pacote");
  const { data: existing } = await supabase
    .from("customer_packages")
    .select("id, package_id, price_cents")
    .eq("unit_id", unitId)
    .eq("sold_ticket_id", ticketId)
    .eq("status", "pendente")
    .returns<{ id: string; package_id: string | null; price_cents: number }[]>();
  const pending = existing ?? [];
  if (!saleLines.length) {
    if (items.some((i) => i.kind === "servico" && i.package_id && !i.customer_package_id)) {
      return { error: "Para usar os serviços do pacote agora, mantenha também a venda do pacote nesta comanda." };
    }
    // Nenhuma venda na comanda: cancela pacotes pendentes que eram dela.
    if (pending.length) {
      await supabase
        .from("customer_packages")
        .update({ status: "cancelada" })
        .in("id", pending.map((c) => c.id))
        .eq("unit_id", unitId);
    }
    return { items };
  }

  const { data: ticket } = await supabase
    .from("tickets")
    .select("customer_id")
    .eq("id", ticketId)
    .eq("unit_id", unitId)
    .maybeSingle<{ customer_id: string | null }>();
  if (!ticket?.customer_id) {
    return { error: "Para vender um pacote, a comanda precisa ser de um cliente cadastrado (com ficha). Abra pela agenda ou pela ficha do cliente." };
  }

  const assigned = new Set<string>();
  /** Pacote do cliente por modelo (package_id), entre pendentes e recém-criados. */
  const saleByTemplate = new Map<string, { id: string; price_cents: number }>();
  const out: PayloadItem[] = [];
  for (const item of items) {
    if (item.kind !== "pacote") {
      out.push(item);
      continue;
    }
    const known = item.customer_package_id ? pending.find((c) => c.id === item.customer_package_id) : undefined;
    if (known) {
      assigned.add(known.id);
      if (known.package_id) saleByTemplate.set(known.package_id, known);
      out.push({ ...item, customer_package_id: known.id, package_id: known.package_id, unit_price_cents: known.price_cents });
      continue;
    }
    const reuse = item.package_id
      ? pending.find((c) => c.package_id === item.package_id && !assigned.has(c.id))
      : undefined;
    if (reuse) {
      assigned.add(reuse.id);
      saleByTemplate.set(reuse.package_id!, reuse);
      out.push({ ...item, customer_package_id: reuse.id, package_id: reuse.package_id, unit_price_cents: reuse.price_cents });
      continue;
    }
    if (!item.package_id) return { error: "Escolha o pacote para vender." };
    const pkg = await getPackage(unitId, item.package_id);
    if (!pkg || !pkg.isActive || !pkg.items.length) return { error: "Pacote não encontrado ou desativado." };
    const price = pkg.priceCents;
    const { data: cp, error: cpError } = await supabase
      .from("customer_packages")
      .insert({
        unit_id: unitId,
        customer_id: ticket.customer_id,
        package_id: pkg.id,
        package_name: pkg.name,
        discount_pct: pkg.discountPct,
        list_cents: pkg.listCents,
        price_cents: price,
        validity_days: pkg.validityDays,
        status: "pendente",
        sold_ticket_id: ticketId,
      })
      .select("id")
      .single();
    if (cpError || !cp) {
      console.error("[caixa] package sale:", cpError?.code);
      return { error: GENERIC };
    }
    const { error: cpItemsError } = await supabase.from("customer_package_items").insert(
      pkg.items.map((i) => ({
        customer_package_id: cp.id,
        unit_id: unitId,
        service_id: i.serviceId,
        service_name: i.serviceName,
        quantity_total: i.quantity,
        unit_price_cents: i.unitPriceCents,
      })),
    );
    if (cpItemsError) {
      console.error("[caixa] package sale items:", cpItemsError.code);
      return { error: GENERIC };
    }
    assigned.add(cp.id);
    saleByTemplate.set(pkg.id, { id: cp.id, price_cents: price });
    out.push({ ...item, name: pkg.name, quantity: 1, customer_package_id: cp.id, package_id: pkg.id, unit_price_cents: price });
  }

  // Uso na mesma comanda da venda: serviço "pelo pacote" que aponta para o modelo
  // vendido aqui ganha o pacote do cliente criado acima (preço da foto da venda).
  for (let idx = 0; idx < out.length; idx++) {
    const item = out[idx]!;
    if (item.kind !== "servico" || item.customer_package_id || !item.package_id) continue;
    const cp = saleByTemplate.get(item.package_id);
    if (!cp) {
      return { error: "Para usar os serviços do pacote agora, mantenha também a venda do pacote nesta comanda." };
    }
    const { data: cpi } = await supabase
      .from("customer_package_items")
      .select("unit_price_cents")
      .eq("customer_package_id", cp.id)
      .eq("service_id", item.service_id ?? "")
      .maybeSingle<{ unit_price_cents: number }>();
    if (!cpi) return { error: "Este serviço não faz parte do pacote vendido." };
    out[idx] = { ...item, customer_package_id: cp.id, unit_price_cents: cpi.unit_price_cents };
  }

  // Venda que saiu da comanda (item excluído): cancela o pacote pendente dela.
  const orphans = pending.filter((c) => !assigned.has(c.id)).map((c) => c.id);
  if (orphans.length) {
    await supabase.from("customer_packages").update({ status: "cancelada" }).in("id", orphans).eq("unit_id", unitId);
  }
  return { items: out };
}

/**
 * Serviço usado de pacote entra no faturamento pela cota: preço pago no pacote
 * ÷ quantidade de serviços. O valor que o cliente vê na comanda continua R$ 0
 * (já pago na venda); esta cota é só a produção do profissional.
 */
async function applyPackageProductionPrice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  items: PayloadItem[],
): Promise<PayloadItem[]> {
  const ids = [
    ...new Set(items.filter((i) => i.kind === "servico" && i.customer_package_id).map((i) => i.customer_package_id!)),
  ];
  if (!ids.length) return items;
  const { data } = await supabase
    .from("customer_packages")
    .select("id, price_cents, customer_package_items(quantity_total)")
    .eq("unit_id", unitId)
    .in("id", ids)
    .returns<{ id: string; price_cents: number; customer_package_items: { quantity_total: number }[] | null }[]>();
  const share = new Map<string, number>();
  for (const cp of data ?? []) {
    const total = (cp.customer_package_items ?? []).reduce((n, i) => n + i.quantity_total, 0);
    share.set(cp.id, packageServiceShareCents(cp.price_cents, total));
  }
  return items.map((i) => {
    if (i.kind !== "servico" || !i.customer_package_id) return i;
    const cents = share.get(i.customer_package_id);
    return cents == null ? i : { ...i, unit_price_cents: cents };
  });
}

export async function usablePackages(unitId: string, ticket: TicketDetail): Promise<TicketPackageOption[]> {
  if (!ticket.customerId) return [];
  const cps = await listCustomerPackages(unitId, ticket.customerId, {
    excludeTicketId: ticket.id,
    onlyUsable: true,
  });
  return cps.map((cp) => ({
    customerPackageId: cp.id,
    packageName: cp.packageName,
    priceCents: cp.priceCents,
    totalServices: cp.totalServices,
    items: cp.items
      .filter((i) => i.serviceId)
      .map((i) => ({
        serviceId: i.serviceId!,
        serviceName: i.serviceName,
        quantityTotal: i.quantityTotal,
        remaining: i.quantityTotal - i.used,
        unitPriceCents: i.unitPriceCents,
      })),
  }));
}

/** Abre (ou reabre) a comanda do agendamento e devolve os dados para o modal da agenda. */
export async function loadComandaAction(slug: string, appointmentId: string): Promise<ComandaLoad> {
  const { unit } = await requireUnitArea(slug, "caixa");
  if (!UUID.test(appointmentId)) return { ok: false, message: GENERIC };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_ticket_from_appointment", { p_appointment: appointmentId });
  if (error || !data) {
    console.error("[caixa] load comanda:", error?.code);
    return { ok: false, message: error ? mapRpc(error) : "Não foi possível abrir a comanda." };
  }
  const [ticket, catalog, register] = await Promise.all([
    getTicket(unit.id, data as string),
    listCatalog(unit.id),
    getOpenRegister(unit.id),
  ]);
  if (!ticket) return { ok: false, message: "Comanda não encontrada." };
  return {
    ok: true,
    ticket,
    services: catalog.services,
    products: catalog.products,
    barbers: catalog.barbers,
    registerOpen: !!register,
    registerDay: register?.businessDate ?? null,
    packages: await usablePackages(unit.id, ticket),
    salePackages: await salePackageOptions(unit.id),
  };
}

export async function cancelTicketAction(slug: string, ticketId: string): Promise<void> {
  const { unit } = await requireUnitArea(slug, "caixa");
  if (!UUID.test(ticketId)) redirect(`/u/${slug}/caixa`);
  const supabase = await createClient();
  await supabase
    .from("tickets")
    .update({ status: "cancelada", closed_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("unit_id", unit.id)
    .eq("status", "aberta");
  touch(slug);
  redirect(`/u/${slug}/caixa`);
}

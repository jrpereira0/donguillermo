"use server";

import { revalidatePath } from "next/cache";
import { requireUnitArea } from "@/lib/auth/guards";
import { fromMinutes, outsideHoursReason, toMinutes, utcToZoned, zonedToUtc } from "@/lib/agenda/time";
import type { AgendaCustomerHit, AgendaFormState } from "@/lib/agenda/types";
import { collectValues } from "@/lib/barbers/form";
import { searchFilter } from "@/lib/customers/queries";
import { formatRetry, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getUnitSettings } from "@/lib/units/queries";
import { toFieldErrors } from "@/lib/validation/auth";
import {
  appointmentSchema,
  blockSchema,
  canMove,
  isStatus,
  occupiesSlot,
} from "@/lib/validation/appointment";
import { customerPhoneField, formatPersonName } from "@/lib/validation/customer";

const ONE_HOUR = 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_DB = /^[1-9][1-9][0-9]{8,9}$/;
const EXCLUSION_VIOLATION = "23P01";
const GENERIC = "Não foi possível concluir a operação. Tente novamente.";
const CHECK = "Confira os campos destacados.";
const BLOCK_BUSY = "Já existe um bloqueio nesse período. Remova-o ou escolha outro horário.";

const EDITABLE = ["agendado", "confirmado", "em_atendimento"];

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

function throttled(userId: string, bucket: string, limit: number): AgendaFormState | null {
  const r = rateLimit(`agenda:${bucket}:${userId}`, limit, ONE_HOUR);
  if (r.ok) return null;
  return { status: "error", message: `Muitas operações seguidas. Tente novamente em ${formatRetry(r.retryAfterSeconds)}.` };
}

const fail = (message: string, values?: Record<string, string>, extra?: Partial<AgendaFormState>): AgendaFormState => ({
  status: "error",
  message,
  values,
  ...extra,
});

type BarberInfo = { id: string; is_active: boolean; work_hours: unknown };
type ExistingRow = {
  id: string;
  barber_id: string;
  status: string;
  starts_at: string;
  appointment_services: { service_id: string; name: string; duration_minutes: number; price_cents: number }[];
};

/**
 * Cria (`appointmentId` nulo) ou edita um agendamento. Tudo que importa é recalculado aqui:
 * o cliente, a duração (soma dos serviços, com a duração própria do profissional), o preço e o
 * horário final vêm do banco, nunca do formulário.
 *
 * Recepção pode encaixar (dois agendamentos no mesmo horário; a grade divide a coluna) e
 * marcar sobre bloqueio / fora do expediente (com confirmação). O booking do cliente no
 * navegador é que não encaixa — valida slot livre na aplicação (`appointmentSlotTaken`).
 */
export async function saveAppointmentAction(
  slug: string,
  appointmentId: string | null,
  _prev: AgendaFormState,
  formData: FormData,
): Promise<AgendaFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "agenda"); // toda action revalida
  const values = collectValues(formData);
  values.serviceIds = formData.getAll("serviceIds").filter((x) => typeof x === "string").join(",");
  const limited = throttled(ctx.userId, "write", 240);
  if (limited) return { ...limited, values };
  if (appointmentId !== null && !UUID.test(appointmentId)) return fail(GENERIC, values);

  const parsed = appointmentSchema.safeParse({
    barberId: str(formData, "barberId"),
    date: str(formData, "date"),
    time: str(formData, "time"),
    serviceIds: formData.getAll("serviceIds").filter((x): x is string => typeof x === "string"),
    customerMode: str(formData, "customerMode"),
    customerId: str(formData, "customerId"),
    customerName: str(formData, "customerName"),
    customerPhone: str(formData, "customerPhone"),
    notes: str(formData, "notes"),
    force: str(formData, "force"),
    noPreference: str(formData, "noPreference"),
  });
  if (!parsed.success) return fail(CHECK, values, { fieldErrors: toFieldErrors(parsed.error) });
  const v = parsed.data;

  const supabase = await createClient(); // sessão do usuário: a RLS também confere

  // Agendamento existente (edição).
  let existing: ExistingRow | null = null;
  if (appointmentId) {
    const { data } = await supabase
      .from("appointments")
      .select("id, barber_id, status, starts_at, appointment_services(service_id, name, duration_minutes, price_cents)")
      .eq("id", appointmentId)
      .eq("unit_id", unit.id)
      .eq("kind", "appointment")
      .maybeSingle<ExistingRow>();
    if (!data) return fail("Agendamento não encontrado.", values);
    if (!EDITABLE.includes(data.status)) {
      return fail("Reative o agendamento antes de editar.", values);
    }
    existing = data;
  }

  // Profissional da unidade.
  const { data: barber } = await supabase
    .from("barbers")
    .select("id, is_active, work_hours")
    .eq("id", v.barberId)
    .eq("unit_id", unit.id)
    .maybeSingle<BarberInfo>();
  if (!barber) return fail(CHECK, values, { fieldErrors: { barberId: "Profissional não encontrado." } });
  if (!barber.is_active && existing?.barber_id !== barber.id) {
    return fail(CHECK, values, { fieldErrors: { barberId: "Este profissional está desativado." } });
  }

  // Serviços: o profissional precisa fazer cada um; nome, duração e preço vêm do catálogo
  // (os que já estavam no agendamento mantêm a "foto" original).
  const [{ data: services }, { data: links }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, duration_minutes, price_cents, is_active")
      .eq("unit_id", unit.id)
      .in("id", v.serviceIds)
      .returns<{ id: string; name: string; duration_minutes: number; price_cents: number; is_active: boolean }[]>(),
    supabase
      .from("barber_services")
      .select("service_id, duration_minutes")
      .eq("unit_id", unit.id)
      .eq("barber_id", barber.id)
      .in("service_id", v.serviceIds)
      .returns<{ service_id: string; duration_minutes: number | null }[]>(),
  ]);
  const kept = new Map((existing?.appointment_services ?? []).map((s) => [s.service_id, s]));
  const svcById = new Map((services ?? []).map((s) => [s.id, s]));
  const linkById = new Map((links ?? []).map((l) => [l.service_id, l]));

  const lines: { service_id: string; name: string; duration_minutes: number; price_cents: number }[] = [];
  for (const id of v.serviceIds) {
    const svc = svcById.get(id);
    const link = linkById.get(id);
    const old = kept.get(id);
    if (!svc || !link || (!svc.is_active && !old)) {
      return fail(CHECK, values, { fieldErrors: { serviceIds: "Algum serviço não está disponível para este profissional." } });
    }
    lines.push(
      old && old.name === svc.name
        ? { service_id: id, name: old.name, duration_minutes: old.duration_minutes, price_cents: old.price_cents }
        : {
            service_id: id,
            name: svc.name,
            duration_minutes: link.duration_minutes ?? svc.duration_minutes,
            price_cents: svc.price_cents,
          },
    );
  }

  // Cliente: no cadastrado, nome e telefone vêm do cadastro.
  let customerId: string | null = null;
  let customerName = v.customerName;
  let customerPhone: string | null = v.customerPhone || null;
  if (v.customerMode === "registered") {
    const { data: c } = await supabase
      .from("customers")
      .select("id, full_name, phone, is_active")
      .eq("id", v.customerId)
      .maybeSingle<{ id: string; full_name: string; phone: string | null; is_active: boolean }>();
    if (!c) return fail(CHECK, values, { fieldErrors: { customerId: "Cliente não encontrado." } });
    if (!c.is_active && existing === null) {
      return fail(CHECK, values, { fieldErrors: { customerId: "Este cliente está desativado." } });
    }
    customerId = c.id;
    customerName = c.full_name;
    customerPhone = c.phone && PHONE_DB.test(c.phone) ? c.phone : null;
  }

  // Início alinhado ao passo da agenda; o fim é a soma real das durações (sem arredondar).
  const settings = await getUnitSettings(unit.id);
  const slot = settings?.slot_minutes ?? 30;
  const startMin = toMinutes(v.time);
  const duration = Math.max(1, lines.reduce((n, l) => n + l.duration_minutes, 0));
  const endMin = startMin + duration;

  const startsAt = zonedToUtc(v.date, v.time);
  const timeChanged = !existing || existing.starts_at !== startsAt.toISOString();
  if (timeChanged && startMin % slot !== 0) {
    return fail(CHECK, values, { fieldErrors: { time: `Escolha um horário de ${slot} em ${slot} minutos (ex.: ${fromMinutes(Math.ceil(startMin / slot) * slot)}).` } });
  }
  if (endMin > 1440) return fail(CHECK, values, { fieldErrors: { time: "O atendimento passaria da meia-noite." } });

  const reason = outsideHoursReason({
    unitHours: settings?.opening_hours,
    barberHours: barber.work_hours,
    date: v.date,
    start: startMin,
    end: endMin,
  });
  if (reason && !v.force) {
    return fail(`${reason} Marque "Encaixe fora do expediente" para confirmar.`, values, { needsForce: true });
  }

  const endsAt = new Date(startsAt.getTime() + duration * 60_000);
  const { error } = await supabase.rpc("save_appointment", {
    p_id: appointmentId,
    p_data: {
      unit_id: unit.id,
      barber_id: barber.id,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      notes: v.notes,
      has_barber_preference: v.hasBarberPreference,
    },
    p_services: lines,
  });
  if (error) {
    if (error.code === EXCLUSION_VIOLATION) return fail(BLOCK_BUSY, values);
    if (error.code === "P0002") return fail("Agendamento não encontrado.", values);
    console.error("[agenda] save:", error.code);
    return fail(GENERIC, values);
  }

  revalidatePath(`/u/${unit.slug}/agenda`);
  revalidatePath(`/u/${unit.slug}/caixa`);
  return {
    status: "success",
    message: appointmentId ? "Agendamento atualizado." : "Agendamento criado.",
    savedDate: utcToZoned(startsAt).date,
  };
}

/**
 * Arrasta na grade: muda só profissional e horário, mantendo cliente, serviços e preferência.
 * Recepção pode encaixar sobre outro agendamento ou bloqueio. O profissional precisa fazer
 * todos os serviços.
 */
export async function moveAppointmentAction(
  slug: string,
  appointmentId: string,
  input: { barberId: string; date: string; time: string },
): Promise<AgendaFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "agenda");
  const limited = throttled(ctx.userId, "write", 240);
  if (limited) return limited;
  if (!UUID.test(appointmentId) || !UUID.test(input.barberId)) return fail(GENERIC);

  const date = (input.date ?? "").trim();
  const time = (input.time ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return fail("Data ou horário inválido.");
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("appointments")
    .select(
      "id, barber_id, status, customer_id, customer_name, customer_phone, notes, has_barber_preference, starts_at, appointment_services(service_id, name, duration_minutes, price_cents)",
    )
    .eq("id", appointmentId)
    .eq("unit_id", unit.id)
    .eq("kind", "appointment")
    .maybeSingle<{
      id: string;
      barber_id: string;
      status: string;
      customer_id: string | null;
      customer_name: string;
      customer_phone: string | null;
      notes: string | null;
      has_barber_preference: boolean | null;
      starts_at: string;
      appointment_services: { service_id: string; name: string; duration_minutes: number; price_cents: number }[];
    }>();
  if (!existing) return fail("Agendamento não encontrado.");
  if (!EDITABLE.includes(existing.status)) {
    return fail("Só é possível mover agendamentos ativos (agendado, confirmado ou em atendimento).");
  }

  const serviceIds = (existing.appointment_services ?? []).map((s) => s.service_id);
  if (serviceIds.length === 0) return fail("Agendamento sem serviços.");

  const { data: barber } = await supabase
    .from("barbers")
    .select("id, is_active, work_hours")
    .eq("id", input.barberId)
    .eq("unit_id", unit.id)
    .maybeSingle<BarberInfo>();
  if (!barber) return fail("Profissional não encontrado.");
  if (!barber.is_active && existing.barber_id !== barber.id) {
    return fail("Este profissional está desativado.");
  }

  const { data: links } = await supabase
    .from("barber_services")
    .select("service_id")
    .eq("unit_id", unit.id)
    .eq("barber_id", barber.id)
    .in("service_id", serviceIds)
    .returns<{ service_id: string }[]>();
  const linkSet = new Set((links ?? []).map((l) => l.service_id));
  if (serviceIds.some((id) => !linkSet.has(id))) {
    return fail("Este profissional não realiza todos os serviços do agendamento.");
  }

  const settings = await getUnitSettings(unit.id);
  const slot = settings?.slot_minutes ?? 30;
  const startMin = toMinutes(time);
  if (startMin % slot !== 0) {
    return fail(`Escolha um horário de ${slot} em ${slot} minutos.`);
  }
  const duration = Math.max(
    1,
    (existing.appointment_services ?? []).reduce((n, s) => n + s.duration_minutes, 0),
  );
  const endMin = startMin + duration;
  if (endMin > 1440) return fail("O atendimento passaria da meia-noite.");

  // Arraste na grade = encaixe da recepção (pode cair fora do expediente ou sobre bloqueio).
  const startsAt = zonedToUtc(date, time);
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);
  const samePlace =
    existing.barber_id === barber.id && existing.starts_at === startsAt.toISOString();
  if (samePlace) return { status: "success", message: "Sem alteração.", savedDate: date };

  const lines = (existing.appointment_services ?? []).map((s) => ({
    service_id: s.service_id,
    name: s.name,
    duration_minutes: s.duration_minutes,
    price_cents: s.price_cents,
  }));

  const { error } = await supabase.rpc("save_appointment", {
    p_id: appointmentId,
    p_data: {
      unit_id: unit.id,
      barber_id: barber.id,
      customer_id: existing.customer_id,
      customer_name: existing.customer_name,
      customer_phone: existing.customer_phone,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      notes: existing.notes,
      has_barber_preference: existing.has_barber_preference !== false,
    },
    p_services: lines,
  });
  if (error) {
    if (error.code === EXCLUSION_VIOLATION) return fail(BLOCK_BUSY);
    if (error.code === "P0002") return fail("Agendamento não encontrado.");
    console.error("[agenda] move:", error.code);
    return fail(GENERIC);
  }

  revalidatePath(`/u/${unit.slug}/agenda`);
  revalidatePath(`/u/${unit.slug}/caixa`);
  const outside = outsideHoursReason({
    unitHours: settings?.opening_hours,
    barberHours: barber.work_hours,
    date,
    start: startMin,
    end: endMin,
  });
  return {
    status: "success",
    message: outside ? "Agendamento movido (encaixe fora do expediente)." : "Agendamento movido.",
    savedDate: utcToZoned(startsAt).date,
  };
}

/** Muda a situação do agendamento (confirmar, iniciar, concluir, faltar, cancelar, reativar). */
export async function setAppointmentStatusAction(slug: string, id: string, to: string): Promise<AgendaFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "agenda");
  const limited = throttled(ctx.userId, "status", 480);
  if (limited) return limited;
  if (!UUID.test(id) || !isStatus(to)) return fail(GENERIC);

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("appointments")
    .select("status")
    .eq("id", id)
    .eq("unit_id", unit.id)
    .eq("kind", "appointment")
    .maybeSingle<{ status: string }>();
  if (!current) return fail("Agendamento não encontrado.");
  if (!canMove(current.status, to)) return fail("Esta mudança de situação não é permitida.");

  const { data, error } = await supabase
    .from("appointments")
    .update({ status: to })
    .eq("id", id)
    .eq("unit_id", unit.id)
    .eq("status", current.status) // evita sobrescrever uma mudança feita por outra pessoa ao mesmo tempo
    .select("id");
  if (error) {
    if (error.code === EXCLUSION_VIOLATION && !occupiesSlot(current.status)) {
      return fail("Não dá para reativar: o horário foi ocupado por outro agendamento ou bloqueio.");
    }
    console.error("[agenda] status:", error.code);
    return fail(GENERIC);
  }
  if (!data?.length) return fail("O agendamento mudou enquanto você olhava. Atualize a tela e tente de novo.");

  revalidatePath(`/u/${unit.slug}/agenda`);
  revalidatePath(`/u/${unit.slug}/caixa`);
  const message =
    to === "cancelado"
      ? "Agendamento cancelado. Horário liberado."
      : to === "faltou"
        ? "Falta registrada. Horário liberado."
        : "Situação atualizada.";
  return { status: "success", message };
}

/** Bloqueia o horário de um profissional (ou de todos os ativos da unidade). */
export async function createBlockAction(slug: string, _prev: AgendaFormState, formData: FormData): Promise<AgendaFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "agenda");
  const values = collectValues(formData);
  const limited = throttled(ctx.userId, "write", 240);
  if (limited) return { ...limited, values };

  const parsed = blockSchema.safeParse({
    barberId: str(formData, "barberId"),
    date: str(formData, "date"),
    start: str(formData, "start"),
    end: str(formData, "end"),
    reason: str(formData, "reason"),
  });
  if (!parsed.success) return fail(CHECK, values, { fieldErrors: toFieldErrors(parsed.error) });
  const v = parsed.data;

  const supabase = await createClient();
  let query = supabase.from("barbers").select("id").eq("unit_id", unit.id).eq("is_active", true);
  if (v.barberId !== "all") query = query.eq("id", v.barberId);
  const { data: barbers } = await query.returns<{ id: string }[]>();
  if (!barbers?.length) {
    return fail(CHECK, values, { fieldErrors: { barberId: "Profissional não encontrado ou desativado." } });
  }

  const startsAt = zonedToUtc(v.date, v.start).toISOString();
  const endsAt = zonedToUtc(v.date, v.end).toISOString();
  // Um único INSERT: se um dos profissionais já tem horário marcado, nenhum bloqueio é criado.
  const { error } = await supabase.from("appointments").insert(
    barbers.map((b) => ({
      unit_id: unit.id,
      barber_id: b.id,
      kind: "block" as const,
      starts_at: startsAt,
      ends_at: endsAt,
      notes: v.reason,
    })),
  );
  if (error) {
    if (error.code === EXCLUSION_VIOLATION) {
      return fail(
        v.barberId === "all"
          ? "Algum profissional já tem bloqueio nesse período. Remova o bloqueio ou escolha outro horário."
          : BLOCK_BUSY,
        values,
      );
    }
    console.error("[agenda] block:", error.code);
    return fail(GENERIC, values);
  }

  revalidatePath(`/u/${unit.slug}/agenda`);
  return {
    status: "success",
    message: barbers.length > 1 ? "Horário bloqueado para todos os profissionais." : "Horário bloqueado.",
    savedDate: v.date,
  };
}

/** Remove um bloqueio (agendamentos não se apagam: são cancelados). */
export async function deleteBlockAction(slug: string, id: string): Promise<AgendaFormState> {
  const { ctx, unit } = await requireUnitArea(slug, "agenda");
  const limited = throttled(ctx.userId, "write", 240);
  if (limited) return limited;
  if (!UUID.test(id)) return fail(GENERIC);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("unit_id", unit.id)
    .eq("kind", "block")
    .select("id");
  if (error) {
    console.error("[agenda] unblock:", error.code);
    return fail(GENERIC);
  }
  if (!data?.length) return fail("Bloqueio não encontrado.");

  revalidatePath(`/u/${unit.slug}/agenda`);
  return { status: "success", message: "Bloqueio removido." };
}

/** Busca clientes da rede (nome, telefone, CPF ou e-mail) para o agendamento. */
export async function searchCustomersAction(slug: string, q: string): Promise<AgendaCustomerHit[]> {
  const { ctx } = await requireUnitArea(slug, "agenda");
  if (throttled(ctx.userId, "search", 1200)) return [];
  const filter = searchFilter(typeof q === "string" ? q : "");
  if (!filter) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone")
    .eq("is_active", true)
    .or(filter)
    .order("search_name")
    .limit(8)
    .returns<{ id: string; full_name: string; phone: string | null }[]>();
  if (error) {
    console.error("[agenda] customer search:", error.code);
    return [];
  }
  return (data ?? []).map((c) => ({ id: c.id, name: c.full_name, phone: c.phone }));
}

export type QuickCustomerResult =
  | { ok: true; customer: AgendaCustomerHit }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * Cadastro rápido no modal da agenda: só nome, sobrenome e telefone.
 * O cliente fica na rede e já volta selecionado para o agendamento.
 */
export async function quickCreateCustomerAction(
  slug: string,
  input: { firstName: string; lastName: string; phone: string },
): Promise<QuickCustomerResult> {
  const { ctx, unit } = await requireUnitArea(slug, "agenda");
  if (throttled(ctx.userId, "write", 120)) {
    return { ok: false, message: "Muitas operações seguidas. Tente de novo em instantes." };
  }

  const first = formatPersonName(input.firstName ?? "");
  const last = formatPersonName(input.lastName ?? "");
  const phoneRaw = input.phone ?? "";

  const fieldErrors: Record<string, string> = {};
  if (first.length < 2) fieldErrors.firstName = "Informe o nome.";
  else if (first.length > 60) fieldErrors.firstName = "Nome muito longo.";
  if (last.length < 2) fieldErrors.lastName = "Informe o sobrenome.";
  else if (last.length > 60) fieldErrors.lastName = "Sobrenome muito longo.";

  const phoneParsed = customerPhoneField.safeParse(phoneRaw);
  if (!phoneParsed.success) {
    fieldErrors.phone = phoneParsed.error.issues[0]?.message ?? "Telefone inválido.";
  }

  const fullName = formatPersonName(`${first} ${last}`);
  if (fullName.length > 120) fieldErrors.firstName = "Nome completo muito longo.";

  if (Object.keys(fieldErrors).length) {
    return { ok: false, message: CHECK, fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      created_unit_id: unit.id,
      full_name: fullName,
      phone: phoneParsed.success ? phoneParsed.data : null,
    })
    .select("id, full_name, phone")
    .single();

  if (error || !data) {
    console.error("[agenda] quick customer:", error?.code);
    return { ok: false, message: GENERIC };
  }

  revalidatePath(`/u/${unit.slug}/clientes`);
  revalidatePath(`/u/${unit.slug}/agenda`);
  return { ok: true, customer: { id: data.id, name: data.full_name, phone: data.phone } };
}

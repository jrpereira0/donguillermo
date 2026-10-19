"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  ChevronLeft,
  Clock,
  Loader2,
  Pencil,
  Receipt,
  RotateCcw,
  Scissors,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import { saveAppointmentAction, setAppointmentStatusAction } from "@/app/u/[slug]/agenda/actions";
import { FormAlert, FieldError } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/unit/form-parts";
import { BarberAvatar } from "@/components/unit/barber-avatar";
import { statusBadgeClass } from "@/lib/agenda/status-style";
import { freeSlots, fromMinutes, longDateLabel, outsideHoursReason, shortDateLabel, toMinutes } from "@/lib/agenda/time";
import type { AgendaBarber, AgendaEntry, AgendaOffers, AgendaService } from "@/lib/agenda/types";
import { initialAgendaState } from "@/lib/agenda/types";
import { maskPhone } from "@/lib/validation/barber";
import {
  NOTES_MAX,
  occupiesSlot,
  STATUS_MOVES,
  statusLabel,
  totals,
  WALKIN_CUSTOMER_NAME,
  type AppointmentStatus,
} from "@/lib/validation/appointment";
import { formatBRL, formatDuration } from "@/lib/validation/service";
import { cn } from "@/lib/utils";
import { CustomerPicker, type CustomerChoice } from "./customer-picker";
import { DialogBody, DialogFooter, DialogShell } from "./dialog-shell";
import { AgendaDateField } from "./mini-calendar";

/** Novo: clique na grade traz profissional/horário; botão Agendar deixa escolher depois. */
export type AppointmentTarget =
  | { kind: "new"; date: string; barberId?: string; time?: string }
  | { kind: "edit"; entry: AgendaEntry };

type Props = {
  slug: string;
  target: AppointmentTarget;
  barbers: AgendaBarber[];
  services: AgendaService[];
  offers: AgendaOffers;
  popularIds: string[];
  entries: AgendaEntry[];
  unitHours: unknown;
  slot: number;
  from: number;
  to: number;
  today: string;
  onClose: () => void;
  onDone: (message: string, date?: string) => void;
  /** Recarrega a grade a partir do banco (horários reais). */
  onRefresh: () => void;
  /** Abre a comanda neste mesmo modal da agenda. */
  onCharge?: (appointmentId: string) => void;
};

const EDITABLE = ["agendado", "confirmado", "em_atendimento"];

type NewStep = "cliente" | "servicos" | "horario" | "revisao";

export function AppointmentDialog(props: Props) {
  const { target } = props;
  const entry = target.kind === "edit" ? target.entry : null;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const editing = !!entry && mode === "edit";

  return (
    <DialogShell
      wide
      eyebrow={entry ? shortDateLabel(entry.date) : "Recepção"}
      title={entry ? (editing ? "Editar agendamento" : "Agendamento") : "Novo agendamento"}
      onClose={props.onClose}
    >
      {entry ? (
        editing ? (
          <EditAppointmentWizard {...props} entry={entry} onBack={() => setMode("view")} />
        ) : (
          <AppointmentDetailView {...props} entry={entry} onEdit={() => setMode("edit")} />
        )
      ) : (
        <NewAppointmentWizard {...props} />
      )}
    </DialogShell>
  );
}

function customerReady(c: CustomerChoice): boolean {
  if (c.mode === "walkin") return true;
  return !!c.selected?.id;
}

function NewAppointmentWizard({
  slug,
  target,
  barbers,
  services,
  offers,
  popularIds,
  entries,
  unitHours,
  slot,
  from,
  to,
  today,
  onClose,
  onDone,
  onRefresh,
}: Props) {
  const presetBarber = target.kind === "new" ? target.barberId : undefined;
  const presetTime = target.kind === "new" ? target.time : undefined;
  const fromGrid = !!(presetBarber && presetTime);

  /** Clique na grade pula o passo de horário; se o slot foi tomado, liberamos a escolha. */
  const [pickTime, setPickTime] = useState(!fromGrid);
  const steps: NewStep[] = pickTime
    ? ["cliente", "servicos", "horario", "revisao"]
    : ["cliente", "servicos", "revisao"];

  const [step, setStep] = useState<NewStep>("cliente");
  const stepIndex = steps.indexOf(step);

  const [state, action, pending] = useActionState(saveAppointmentAction.bind(null, slug, null), initialAgendaState);

  const [barberId, setBarberId] = useState(presetBarber ?? "");
  const [date, setDate] = useState(target.kind === "new" ? target.date : "");
  const [time, setTime] = useState(presetTime ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [force, setForce] = useState(false);
  const [customer, setCustomer] = useState<CustomerChoice>({
    mode: "registered",
    selected: null,
    name: "",
    phone: "",
  });
  /** Cliente sem preferência de profissional: qualquer um que faça os serviços. */
  const [noPreference, setNoPreference] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") onDone(state.message ?? "Agendamento salvo.", state.savedDate);
  }, [state, onDone]);

  // Horário ocupado no banco: atualiza a grade e manda escolher outro.
  useEffect(() => {
    if (state.status !== "error" || !state.slotTaken) return;
    onRefresh();
    setTime("");
    setPickTime(true);
    setStep("horario");
  }, [state, onRefresh]);

  // Ao escolher horário, puxa a agenda fresca do servidor.
  useEffect(() => {
    if (step === "horario") onRefresh();
  }, [step, onRefresh]);

  const errors = state.fieldErrors ?? {};
  const barber = barbers.find((b) => b.id === barberId);
  const barberOffers = useMemo(() => offers[barberId] ?? {}, [offers, barberId]);

  /** Serviços que pelo menos um profissional ativo faz (passo 2 sem barbeiro ainda). */
  const catalogServices = useMemo(() => {
    const ids = new Set<string>();
    for (const b of barbers) {
      if (b.inactive) continue;
      for (const sid of Object.keys(offers[b.id] ?? {})) ids.add(sid);
    }
    return services.filter((s) => ids.has(s.id));
  }, [barbers, offers, services]);

  const available = useMemo(() => {
    if (!barberId) return catalogServices;
    return services.filter((s) => s.id in barberOffers);
  }, [barberId, catalogServices, services, barberOffers]);

  const lines = useMemo(
    () =>
      picked.flatMap((id) => {
        const s = services.find((x) => x.id === id);
        if (!s) return [];
        const minutes = barberId ? (barberOffers[id] ?? s.minutes) : s.minutes;
        return [{ id, name: s.name, minutes, priceCents: s.priceCents }];
      }),
    [picked, services, barberOffers, barberId],
  );
  const sum = totals(lines);
  const duration = sum.minutes;
  const startMin = /^\d{2}:\d{2}$/.test(time) ? toMinutes(time) : NaN;
  const endMin = startMin + duration;

  const hoursProblem =
    barber && duration > 0 && Number.isFinite(startMin) && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? outsideHoursReason({ unitHours, barberHours: barber.workHours, date, start: startMin, end: endMin })
      : null;
  const needForce = !!hoursProblem || state.needsForce === true;

  const barbersForServices = useMemo(() => {
    if (picked.length === 0) return barbers.filter((b) => !b.inactive);
    return barbers.filter((b) => {
      if (b.inactive) return false;
      const off = offers[b.id] ?? {};
      return picked.every((sid) => sid in off);
    });
  }, [barbers, offers, picked]);

  /** Só outros agendamentos ocupam o slot na escolha; bloqueio a recepção pode encaixar por cima. */
  function busySpans(id: string) {
    return entries
      .filter((e) => e.barberId === id)
      .filter((e) => e.kind === "appointment" && occupiesSlot(e.status))
      .map((e) => ({ start: e.startMin, end: e.endMin }));
  }

  const slots = useMemo(() => {
    if (duration <= 0) return [];
    if (noPreference) {
      const free = new Set<string>();
      for (const b of barbersForServices) {
        for (const t of freeSlots({
          unitHours,
          barberHours: b.workHours,
          date,
          slot,
          durationMin: duration,
          busy: busySpans(b.id),
          from,
          to,
          allowOutside: true,
          allowOverlap: true, // recepção: encaixe
        })) {
          free.add(t);
        }
      }
      return [...free].sort();
    }
    if (!barber) return [];
    return freeSlots({
      unitHours,
      barberHours: barber.workHours,
      date,
      slot,
      durationMin: duration,
      busy: busySpans(barber.id),
      from,
      to,
      allowOutside: true,
      allowOverlap: true,
    });
  }, [noPreference, barber, barbersForServices, duration, unitHours, date, slot, from, to, entries]);

  function assignBarberForTime(t: string): string {
    // Prefere profissional livre; se todos ocupados, encaixa no primeiro que faz o serviço.
    let fallback = "";
    for (const b of barbersForServices) {
      const base = {
        unitHours,
        barberHours: b.workHours,
        date,
        slot,
        durationMin: duration,
        busy: busySpans(b.id),
        from,
        to,
        allowOutside: true as const,
      };
      if (freeSlots(base).includes(t)) return b.id;
      if (!fallback && freeSlots({ ...base, allowOverlap: true }).includes(t)) fallback = b.id;
    }
    return fallback;
  }

  function changeBarber(id: string) {
    setNoPreference(false);
    setBarberId(id);
    setTime("");
    const next = offers[id] ?? {};
    setPicked((cur) => cur.filter((sid) => sid in next));
  }

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function goNext() {
    setStepError(null);
    if (step === "cliente") {
      if (!customerReady(customer)) {
        setStepError("Busque e escolha o cliente, ou use “Sem cadastro”.");
        return;
      }
      setStep("servicos");
      return;
    }
    if (step === "servicos") {
      if (picked.length === 0) {
        setStepError("Escolha pelo menos um serviço.");
        return;
      }
      if (!pickTime && fromGrid) {
        // Garante que o profissional da grade faz os serviços escolhidos.
        const off = offers[presetBarber!] ?? {};
        if (picked.some((id) => !(id in off))) {
          setStepError("Este profissional não faz todos os serviços escolhidos. Troque os serviços.");
          return;
        }
        // Adia a troca: o mesmo clique do Continuar não pode cair no submit "Agendar".
        window.setTimeout(() => setStep("revisao"), 0);
        return;
      }
      setStep("horario");
      return;
    }
    if (step === "horario") {
      if (!time) {
        setStepError("Escolha um horário disponível.");
        return;
      }
      if (noPreference) {
        const assigned = barberId || assignBarberForTime(time);
        if (!assigned) {
          setStepError("Nenhum profissional livre nesse horário.");
          return;
        }
        setBarberId(assigned);
      } else if (!barberId) {
        setStepError("Escolha o profissional ou marque sem preferência.");
        return;
      }
      window.setTimeout(() => setStep("revisao"), 0);
    }
  }

  function goBack() {
    setStepError(null);
    const i = steps.indexOf(step);
    if (i > 0) setStep(steps[i - 1]!);
  }

  const stepLabels: Record<NewStep, string> = {
    cliente: "Cliente",
    servicos: "Serviços",
    horario: "Horário",
    revisao: "Confirmar",
  };

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      {/* Campos sempre enviados */}
      <input type="hidden" name="barberId" value={barberId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />
      <input type="hidden" name="notes" value={notes} />
      {force ? <input type="hidden" name="force" value="on" /> : null}
      {noPreference ? <input type="hidden" name="noPreference" value="on" /> : null}
      {picked.map((id) => (
        <input key={id} type="hidden" name="serviceIds" value={id} />
      ))}

      <DialogBody className="flex flex-col gap-5">
        <WizardStepNav steps={steps} step={step} stepIndex={stepIndex} labels={stepLabels} />

        {stepError ? <FormAlert tone="error">{stepError}</FormAlert> : null}
        {state.status === "error" && state.message && step === "revisao" ? (
          <FormAlert tone="error" title={needForce ? "Fora do expediente" : undefined}>
            {state.message}
          </FormAlert>
        ) : null}

        <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5 disabled:opacity-90">
          {/* Cliente fica montado (oculto nos outros passos) para os campos irem no submit. */}
          <section className={cn("flex flex-col gap-3", step !== "cliente" && "hidden")}>
            <StepHeading title="Quem é o cliente?" hint="Busque na base ou cadastre na hora." />
            <CustomerPicker slug={slug} value={customer} onChange={setCustomer} errors={errors} />
            <NoPreferenceSwitch
              checked={noPreference}
              onCheckedChange={(on) => {
                if (on) {
                  setNoPreference(true);
                  if (!fromGrid) {
                    setBarberId("");
                    setTime("");
                  }
                } else {
                  setNoPreference(false);
                }
              }}
            />
          </section>

          {step === "servicos" ? (
            <section className="flex flex-col gap-3">
              <StepHeading
                title="Quais serviços?"
                hint={
                  fromGrid && barber
                    ? `Serviços que ${barber.name} realiza.`
                    : "Depois escolhemos o profissional e o horário."
                }
              />
              {available.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  {fromGrid && barber ? (
                    <>
                      <p>Este profissional ainda não tem serviços ligados.</p>
                      <Link
                        href={`/u/${slug}/profissionais/${barber.id}`}
                        className={buttonVariants({ variant: "outline", size: "sm", className: "mt-3" })}
                      >
                        Configurar serviços
                      </Link>
                    </>
                  ) : (
                    <p>Nenhum serviço disponível na unidade.</p>
                  )}
                </div>
              ) : (
                <ServiceChecklist
                  services={available}
                  popularIds={popularIds}
                  searchable
                  picked={picked}
                  minutesOf={(id) => {
                    const s = services.find((x) => x.id === id)!;
                    return barberId ? (barberOffers[id] ?? s.minutes) : s.minutes;
                  }}
                  onToggle={toggle}
                />
              )}
              <FieldError id="serviceIds-error" message={errors.serviceIds} />
              {lines.length > 0 ? <TotalsCard sum={sum} /> : null}
            </section>
          ) : null}

          {step === "horario" ? (
            <section className="flex flex-col gap-4">
              <StepHeading
                title="Profissional e horário"
                hint={
                  noPreference
                    ? "Escolha data e um horário livre — o profissional fica a quem estiver disponível."
                    : "Escolha data, profissional e um horário livre."
                }
              />
              <Field id="datePick" label="Data" error={errors.date}>
                <AgendaDateField
                  id="datePick"
                  value={date}
                  today={today}
                  invalid={!!errors.date}
                  onChange={(iso) => {
                    setDate(iso);
                    setTime("");
                  }}
                />
              </Field>
              {!noPreference ? (
                <Field id="barberPick" label="Profissional" error={errors.barberId}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {barbersForServices.map((b) => {
                      const on = barberId === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => changeBarber(b.id)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                            on ? "border-gold/55 bg-gold/[0.08]" : "border-border/80 hover:border-gold/35",
                          )}
                        >
                          <BarberAvatar name={b.name} url={b.photoUrl} className="size-9 text-xs" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                          {on ? <Check className="size-4 shrink-0 text-gold" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              ) : (
                <p className="rounded-xl border border-dashed border-gold/30 bg-gold/[0.04] px-3.5 py-3 text-sm text-muted-foreground">
                  Sem preferência — o horário será de qualquer profissional livre.
                </p>
              )}
              {barbersForServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum profissional faz todos os serviços escolhidos. Volte e ajuste os serviços.
                </p>
              ) : null}

              {noPreference || barberId ? (
                <div className="flex flex-col gap-2">
                  <p className="label-caps text-[0.65rem] text-gold/90">Horários disponíveis</p>
                  {slots.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                      Sem horários livres neste dia para a duração escolhida.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((t) => {
                        const on = time === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setTime(t);
                              if (noPreference) setBarberId(assignBarberForTime(t));
                            }}
                            className={cn(
                              "h-10 cursor-pointer rounded-lg border font-medium tabular-nums transition-colors",
                              on
                                ? "border-gold bg-gold text-[#101010]"
                                : "border-border text-muted-foreground hover:border-gold/40 hover:text-foreground",
                            )}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <FieldError id="time-error" message={errors.time} />
                </div>
              ) : null}
            </section>
          ) : null}

          {step === "revisao" ? (
            <section className="flex flex-col gap-4">
              <StepHeading title="Confirmar" hint="Revise o resumo e confirme o horário." />

              <div className="overflow-hidden rounded-xl border border-border/80 bg-[#121212]">
                <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold/35 bg-gold/10 text-gold">
                    <UserRound className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="label-caps text-[0.6rem] text-muted-foreground">Cliente</p>
                    <p className="truncate font-medium">
                      {customer.mode === "registered" ? customer.selected?.name : WALKIN_CUSTOMER_NAME}
                    </p>
                    {customer.mode === "registered" && customer.selected?.phone ? (
                      <p className="truncate text-xs text-muted-foreground">{maskPhone(customer.selected.phone)}</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 border-b border-border/60 px-4 py-3.5 sm:grid-cols-2">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[#0e0e0e] text-gold">
                      <Clock className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="label-caps text-[0.6rem] text-muted-foreground">Quando</p>
                      <p className="text-sm font-medium">{capitalize(longDateLabel(date))}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {time && Number.isFinite(startMin) && duration > 0
                          ? `${time} – ${fromMinutes(endMin)}`
                          : time || "—"}
                        <span className="text-muted-foreground/60"> · {formatDuration(duration)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    {noPreference ? (
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/35 bg-gold/10 text-gold">
                        <Users className="size-3.5" aria-hidden="true" />
                      </span>
                    ) : barber ? (
                      <BarberAvatar name={barber.name} url={barber.photoUrl} className="size-8 text-[0.65rem]" />
                    ) : (
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[#0e0e0e] text-muted-foreground">
                        <UserRound className="size-3.5" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="label-caps text-[0.6rem] text-muted-foreground">Profissional</p>
                      {noPreference ? (
                        <>
                          <p className="truncate text-sm font-medium text-gold">Sem preferência</p>
                          {barber ? (
                            <p className="truncate text-xs text-muted-foreground">Atribuído a {barber.name}</p>
                          ) : null}
                        </>
                      ) : (
                        <p className="truncate text-sm font-medium">{barber?.name ?? "—"}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3.5">
                  <p className="label-caps mb-2.5 text-[0.6rem] text-muted-foreground">Serviços</p>
                  <ul className="flex flex-col gap-2">
                    {lines.map((l) => (
                      <li key={l.id} className="flex items-center gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-gold/20 bg-gold/[0.07] text-gold">
                          <Scissors className="size-3" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(l.minutes)}</span>
                        <span className="w-16 shrink-0 text-right text-sm tabular-nums">{formatBRL(l.priceCents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-gold/25 bg-gradient-to-r from-gold/[0.08] to-transparent px-4 py-3.5">
                  <div>
                    <p className="label-caps text-[0.6rem] text-muted-foreground">Total</p>
                    <p className="text-xs text-muted-foreground">{formatDuration(sum.minutes)} de serviço</p>
                  </div>
                  <p className="font-heading text-2xl font-semibold tracking-wide text-gold tabular-nums">
                    {formatBRL(sum.priceCents)}
                  </p>
                </div>
              </div>

              <Field id="notes" label="Observação (opcional)" error={errors.notes}>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={NOTES_MAX}
                  rows={2}
                  placeholder="Ex.: prefere a máquina no 2."
                  aria-invalid={errors.notes ? true : undefined}
                />
              </Field>

              {needForce ? (
                <div className="flex flex-col gap-3 rounded-xl border border-gold/35 bg-gold/[0.06] p-4">
                  <p className="text-sm text-muted-foreground">
                    {hoursProblem ?? "Este horário está fora do expediente."}
                  </p>
                  <Switch checked={force} onChange={(e) => setForce(e.target.checked)}>
                    Encaixe fora do expediente
                  </Switch>
                </div>
              ) : null}
            </section>
          ) : null}
        </fieldset>
      </DialogBody>

      <DialogFooter>
        <div className="flex gap-2 sm:order-1">
          {stepIndex > 0 ? (
            <Button type="button" variant="outline" size="lg" onClick={goBack} disabled={pending} className="gap-1.5">
              <ChevronLeft className="size-4" />
              Voltar
            </Button>
          ) : (
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
              Fechar
            </Button>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:order-2 sm:flex-row">
          {step === "revisao" ? (
            <Button key="salvar" type="submit" variant="luxe" size="lg" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Agendar
            </Button>
          ) : (
            <Button key="continuar" type="button" variant="luxe" size="lg" onClick={goNext} disabled={pending}>
              Continuar
            </Button>
          )}
        </div>
      </DialogFooter>
    </form>
  );
}

/** Detalhe do agendamento: ver primeiro, depois editar ou mudar situação. */
function AppointmentDetailView({
  slug,
  barbers,
  slot,
  onDone,
  onCharge,
  onEdit,
  entry,
}: Props & { entry: AgendaEntry; onEdit: () => void }) {
  const [statusPending, startStatus] = useTransition();
  const [statusError, setStatusError] = useState<string | null>(null);
  const canEdit = EDITABLE.includes(entry.status);
  const barber = barbers.find((b) => b.id === entry.barberId);
  const noPref = entry.hasBarberPreference === false;
  const sum = totals(entry.services.map((s) => ({ minutes: s.minutes, priceCents: s.priceCents })));
  const duration = sum.minutes > 0 ? sum.minutes : Math.max(1, entry.endMin - entry.startMin);
  const mainMove = (STATUS_MOVES[entry.status as AppointmentStatus] ?? []).find((m) => m.tone !== "danger") ?? null;
  const phone = entry.customerPhone ? maskPhone(entry.customerPhone) : null;

  function move(to: AppointmentStatus) {
    setStatusError(null);
    startStatus(async () => {
      const r = await setAppointmentStatusAction(slug, entry.id, to);
      if (r.status === "success") onDone(r.message ?? "Situação atualizada.");
      else setStatusError(r.message ?? "Não foi possível mudar a situação.");
    });
  }

  const walkIn = !entry.customerId || entry.customerName === WALKIN_CUSTOMER_NAME;
  const authorRaw = entry.authorName?.includes("@")
    ? entry.authorName.split("@")[0]
    : entry.authorName;
  const author = authorRaw && /rec+e?p/i.test(authorRaw) ? "Recepção" : authorRaw;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogBody scroll={false} className="flex flex-col gap-5">
        {statusError ? <FormAlert tone="error">{statusError}</FormAlert> : null}

        {/* Horário — limpo: hora grande, situação ao lado, data numa linha */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="font-heading text-[2rem] font-semibold leading-none tracking-wide text-gold tabular-nums">
              {entry.time}
              <span className="mx-2 font-normal text-gold/40">–</span>
              {entry.endTime}
            </p>
            <span className={cn("label-caps rounded-full border px-3 py-1 text-[0.65rem]", statusBadgeClass(entry.status))}>
              {statusLabel(entry.status)}
            </span>
          </div>
          <p className="mt-2 text-sm capitalize text-muted-foreground">
            {longDateLabel(entry.date)}
            <span className="text-muted-foreground/40"> · </span>
            {formatDuration(duration)}
          </p>
        </div>

        <div className="h-px bg-border/60" aria-hidden="true" />

        {/* Cliente + profissional — sem caixas, só avatar e texto */}
        <div className="grid grid-cols-2 gap-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.08] text-gold">
              <UserRound className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="label-caps text-[0.6rem] leading-none text-muted-foreground">Cliente</p>
              <p className="mt-1.5 truncate text-sm font-medium leading-snug text-cream">
                {walkIn ? "Cliente sem cadastro" : (entry.customerName ?? "—")}
              </p>
              {phone ? <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">{phone}</p> : null}
              {entry.customerId ? (
                <Link
                  href={`/u/${slug}/clientes/${entry.customerId}`}
                  className="link-luxe mt-1 inline-block text-xs font-medium"
                >
                  Ver ficha
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 items-start gap-3">
            {barber ? (
              <BarberAvatar name={barber.name} url={barber.photoUrl} className="size-10 shrink-0 text-sm" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.08] text-gold">
                <Users className="size-4" aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0">
              <p className="label-caps text-[0.6rem] leading-none text-muted-foreground">Profissional</p>
              <p className="mt-1.5 truncate text-sm font-medium leading-snug text-cream">
                {barber?.name ?? "A definir"}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {noPref ? "Sem preferência do cliente" : (barber?.role ?? "")}
              </p>
            </div>
          </div>
        </div>

        <div className="h-px bg-border/60" aria-hidden="true" />

        {/* Serviços — lista simples com total */}
        <div>
          <p className="label-caps text-[0.6rem] text-muted-foreground">Serviços</p>
          {entry.services.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhum serviço.</p>
          ) : (
            <>
              <ul className="mt-1 divide-y divide-border/50">
                {entry.services.map((s) => (
                  <li
                    key={s.serviceId}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 py-2.5 text-sm"
                  >
                    <span className="truncate text-cream">{s.name}</span>
                    <span className="text-right text-xs tabular-nums text-muted-foreground">
                      {formatDuration(s.minutes)}
                    </span>
                    <span className="min-w-[4.25rem] text-right tabular-nums text-cream/90">
                      {formatBRL(s.priceCents)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-gold/25 pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-heading text-xl font-semibold leading-none tracking-wide text-gold tabular-nums">
                  {formatBRL(sum.priceCents)}
                </span>
              </div>
            </>
          )}
        </div>

        {entry.notes?.trim() ? (
          <div>
            <p className="label-caps text-[0.6rem] text-muted-foreground">Observação</p>
            <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-sm leading-snug text-cream/85">
              {entry.notes.trim()}
            </p>
          </div>
        ) : null}

        {author ? (
          <p className="pt-0.5 text-center text-[0.7rem] text-muted-foreground/55">Marcado por {author}</p>
        ) : null}
      </DialogBody>

      <DialogFooter className="flex-col gap-2 py-3 sm:flex-col sm:items-stretch sm:py-3">
        {onCharge && entry.status !== "cancelado" && entry.status !== "faltou" ? (
          <Button type="button" variant="luxe" size="lg" className="w-full" disabled={statusPending} onClick={() => onCharge(entry.id)}>
            <Receipt className="size-3.5" aria-hidden="true" />
            Cobrar
          </Button>
        ) : null}
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={statusPending}
              onClick={onEdit}
              className="sm:flex-1"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Editar
            </Button>
          ) : null}
          {mainMove ? (
            <Button
              type="button"
              variant={onCharge && entry.status !== "cancelado" && entry.status !== "faltou" ? "outline" : "luxe"}
              size="lg"
              disabled={statusPending}
              onClick={() => move(mainMove.to)}
              className={cn(
                "sm:flex-[1.35]",
                onCharge && entry.status !== "cancelado" && entry.status !== "faltou"
                  ? "border-gold/40 text-gold hover:border-gold/70 hover:bg-gold/10 hover:text-gold"
                  : undefined,
              )}
            >
              {statusPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : mainMove.label.startsWith("Reabrir") || mainMove.label.startsWith("Reativar") ? (
                <RotateCcw className="size-3.5" aria-hidden="true" />
              ) : null}
              {mainMove.label}
            </Button>
          ) : null}
        </div>
      </DialogFooter>
    </div>
  );
}

/** Edição em passos — mesmo fluxo didático do “Agendar”. */
function EditAppointmentWizard({
  slug,
  barbers,
  services,
  offers,
  popularIds,
  entries,
  unitHours,
  slot,
  from,
  to,
  today,
  onDone,
  onRefresh,
  onBack,
  entry,
}: Props & { entry: AgendaEntry; onBack: () => void }) {
  const steps: NewStep[] = ["cliente", "servicos", "horario", "revisao"];
  const [step, setStep] = useState<NewStep>("cliente");
  const stepIndex = steps.indexOf(step);

  const [state, action, pending] = useActionState(
    saveAppointmentAction.bind(null, slug, entry.id),
    initialAgendaState,
  );

  const [barberId, setBarberId] = useState(entry.barberId);
  const [date, setDate] = useState(entry.date);
  const [time, setTime] = useState(entry.time);
  const [picked, setPicked] = useState<string[]>(entry.services.map((s) => s.serviceId));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [force, setForce] = useState(false);
  const [customer, setCustomer] = useState<CustomerChoice>(() =>
    !entry.customerId
      ? { mode: "walkin", selected: null, name: entry.customerName ?? "", phone: maskPhone(entry.customerPhone) }
      : {
          mode: "registered",
          selected: { id: entry.customerId, name: entry.customerName ?? "", phone: entry.customerPhone },
          name: "",
          phone: "",
        },
  );
  const [noPreference, setNoPreference] = useState(!entry.hasBarberPreference);
  const [stepError, setStepError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") onDone(state.message ?? "Agendamento atualizado.", state.savedDate);
  }, [state, onDone]);

  useEffect(() => {
    if (state.status !== "error" || !state.slotTaken) return;
    onRefresh();
    setTime("");
    setStep("horario");
  }, [state, onRefresh]);

  useEffect(() => {
    if (step === "horario") onRefresh();
  }, [step, onRefresh]);

  const errors = state.fieldErrors ?? {};
  const barber = barbers.find((b) => b.id === barberId);
  const barberOffers = useMemo(() => offers[barberId] ?? {}, [offers, barberId]);
  const keepServices = useMemo(() => new Set(entry.services.map((s) => s.serviceId)), [entry]);

  const catalogServices = useMemo(() => {
    const ids = new Set<string>();
    for (const b of barbers) {
      if (b.inactive) continue;
      for (const sid of Object.keys(offers[b.id] ?? {})) ids.add(sid);
    }
    for (const id of keepServices) ids.add(id);
    return services.filter((s) => ids.has(s.id));
  }, [barbers, offers, services, keepServices]);

  const available = useMemo(() => {
    if (!barberId) return catalogServices;
    return services.filter((s) => s.id in barberOffers || keepServices.has(s.id));
  }, [barberId, catalogServices, services, barberOffers, keepServices]);

  const lines = useMemo(
    () =>
      picked.flatMap((id) => {
        const saved = entry.services.find((s) => s.serviceId === id);
        if (saved) return [{ id, name: saved.name, minutes: saved.minutes, priceCents: saved.priceCents }];
        const s = services.find((x) => x.id === id);
        if (!s) return [];
        return [{ id, name: s.name, minutes: barberOffers[id] ?? s.minutes, priceCents: s.priceCents }];
      }),
    [picked, services, barberOffers, entry],
  );
  const sum = totals(lines);
  const duration = sum.minutes;
  const startMin = /^\d{2}:\d{2}$/.test(time) ? toMinutes(time) : NaN;
  const endMin = startMin + duration;

  const hoursProblem =
    barber && duration > 0 && Number.isFinite(startMin) && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? outsideHoursReason({ unitHours, barberHours: barber.workHours, date, start: startMin, end: endMin })
      : null;
  const needForce = !!hoursProblem || state.needsForce === true;

  const barbersForServices = useMemo(() => {
    if (picked.length === 0) return barbers.filter((b) => !b.inactive || b.id === entry.barberId);
    return barbers.filter((b) => {
      if (b.inactive && b.id !== entry.barberId) return false;
      const off = offers[b.id] ?? {};
      return picked.every((sid) => sid in off || keepServices.has(sid));
    });
  }, [barbers, offers, picked, entry.barberId, keepServices]);

  /** Só outros agendamentos ocupam o slot; a recepção pode marcar em cima de bloqueio. */
  function busySpans(id: string) {
    return entries
      .filter((e) => e.barberId === id && e.id !== entry.id)
      .filter((e) => e.kind === "appointment" && occupiesSlot(e.status))
      .map((e) => ({ start: e.startMin, end: e.endMin }));
  }

  const slots = useMemo(() => {
    if (duration <= 0) return time ? [time] : [];
    let list: string[] = [];
    if (noPreference) {
      const free = new Set<string>();
      for (const b of barbersForServices) {
        for (const t of freeSlots({
          unitHours,
          barberHours: b.workHours,
          date,
          slot,
          durationMin: duration,
          busy: busySpans(b.id),
          from,
          to,
          allowOutside: true,
          allowOverlap: true,
        })) {
          free.add(t);
        }
      }
      list = [...free].sort();
    } else if (barber) {
      list = freeSlots({
        unitHours,
        barberHours: barber.workHours,
        date,
        slot,
        durationMin: duration,
        busy: busySpans(barber.id),
        from,
        to,
        allowOutside: true,
        allowOverlap: true,
      });
    }
    // Mantém o horário atual selecionável mesmo se estiver “fora” da lista livre.
    if (time && !list.includes(time)) list = [time, ...list].sort();
    return list;
  }, [noPreference, barber, barbersForServices, duration, unitHours, date, slot, from, to, entries, time, entry.id]);

  function assignBarberForTime(t: string): string {
    let fallback = barberId;
    for (const b of barbersForServices) {
      const base = {
        unitHours,
        barberHours: b.workHours,
        date,
        slot,
        durationMin: duration,
        busy: busySpans(b.id),
        from,
        to,
        allowOutside: true as const,
      };
      if (freeSlots(base).includes(t) || (t === time && b.id === barberId)) return b.id;
      if (fallback === barberId && freeSlots({ ...base, allowOverlap: true }).includes(t)) {
        fallback = b.id;
      }
    }
    return fallback;
  }

  function changeBarber(id: string) {
    setNoPreference(false);
    setBarberId(id);
    const next = offers[id] ?? {};
    setPicked((cur) => cur.filter((sid) => sid in next || keepServices.has(sid)));
  }

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function goNext() {
    setStepError(null);
    if (step === "cliente") {
      if (!customerReady(customer)) {
        setStepError("Busque e escolha o cliente, ou use “Sem cadastro”.");
        return;
      }
      setStep("servicos");
      return;
    }
    if (step === "servicos") {
      if (picked.length === 0) {
        setStepError("Escolha pelo menos um serviço.");
        return;
      }
      setStep("horario");
      return;
    }
    if (step === "horario") {
      if (!time) {
        setStepError("Escolha um horário disponível.");
        return;
      }
      if (noPreference) {
        const assigned = barberId || assignBarberForTime(time);
        if (!assigned) {
          setStepError("Nenhum profissional livre nesse horário.");
          return;
        }
        setBarberId(assigned);
      } else if (!barberId) {
        setStepError("Escolha o profissional ou marque sem preferência.");
        return;
      }
      window.setTimeout(() => setStep("revisao"), 0);
    }
  }

  function goBack() {
    setStepError(null);
    if (stepIndex === 0) {
      onBack();
      return;
    }
    setStep(steps[stepIndex - 1]!);
  }

  const stepLabels: Record<NewStep, string> = {
    cliente: "Cliente",
    servicos: "Serviços",
    horario: "Horário",
    revisao: "Confirmar",
  };

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="barberId" value={barberId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />
      <input type="hidden" name="notes" value={notes} />
      {force ? <input type="hidden" name="force" value="on" /> : null}
      {noPreference ? <input type="hidden" name="noPreference" value="on" /> : null}
      {picked.map((id) => (
        <input key={id} type="hidden" name="serviceIds" value={id} />
      ))}

      <DialogBody className="flex flex-col gap-5">
        <WizardStepNav steps={steps} step={step} stepIndex={stepIndex} labels={stepLabels} />

        {stepError ? <FormAlert tone="error">{stepError}</FormAlert> : null}
        {state.status === "error" && state.message && step === "revisao" ? (
          <FormAlert tone="error" title={needForce ? "Fora do expediente" : undefined}>
            {state.message}
          </FormAlert>
        ) : null}

        <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5 disabled:opacity-90">
          <section className={cn("flex flex-col gap-3", step !== "cliente" && "hidden")}>
            <StepHeading title="Quem é o cliente?" hint="Troque o cliente ou a preferência de profissional." />
            <CustomerPicker slug={slug} value={customer} onChange={setCustomer} errors={errors} />
            <NoPreferenceSwitch
              checked={noPreference}
              onCheckedChange={(on) => {
                if (on) {
                  setNoPreference(true);
                } else {
                  setNoPreference(false);
                }
              }}
            />
          </section>

          {step === "servicos" ? (
            <section className="flex flex-col gap-3">
              <StepHeading title="Quais serviços?" hint="Ajuste o que será feito neste horário." />
              {available.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
                  Nenhum serviço disponível.
                </p>
              ) : (
                <ServiceChecklist
                  services={available}
                  popularIds={popularIds}
                  searchable
                  picked={picked}
                  minutesOf={(id) => {
                    const saved = entry.services.find((x) => x.serviceId === id);
                    if (saved) return saved.minutes;
                    const s = services.find((x) => x.id === id)!;
                    return barberId ? (barberOffers[id] ?? s.minutes) : s.minutes;
                  }}
                  onToggle={toggle}
                />
              )}
              <FieldError id="serviceIds-error" message={errors.serviceIds} />
              {lines.length > 0 ? <TotalsCard sum={sum} /> : null}
            </section>
          ) : null}

          {step === "horario" ? (
            <section className="flex flex-col gap-4">
              <StepHeading
                title="Profissional e horário"
                hint={
                  noPreference
                    ? "Escolha data e um horário livre — o profissional fica a quem estiver disponível."
                    : "Altere data, profissional ou horário."
                }
              />
              <Field id="editDate" label="Data" error={errors.date}>
                <AgendaDateField
                  id="editDate"
                  value={date}
                  today={today}
                  invalid={!!errors.date}
                  onChange={(iso) => {
                    setDate(iso);
                    if (iso !== entry.date) setTime("");
                  }}
                />
              </Field>
              {!noPreference ? (
                <Field id="editBarber" label="Profissional" error={errors.barberId}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {barbersForServices.map((b) => {
                      const on = barberId === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => changeBarber(b.id)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                            on ? "border-gold/55 bg-gold/[0.08]" : "border-border/80 hover:border-gold/35",
                          )}
                        >
                          <BarberAvatar name={b.name} url={b.photoUrl} className="size-9 text-xs" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                          {on ? <Check className="size-4 shrink-0 text-gold" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              ) : (
                <p className="rounded-xl border border-dashed border-gold/30 bg-gold/[0.04] px-3.5 py-3 text-sm text-muted-foreground">
                  Sem preferência — o horário será de qualquer profissional livre.
                </p>
              )}

              {barbersForServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum profissional faz todos os serviços escolhidos. Volte e ajuste os serviços.
                </p>
              ) : null}

              {noPreference || barberId ? (
                <div className="flex flex-col gap-2">
                  <p className="label-caps text-[0.65rem] text-gold/90">Horários disponíveis</p>
                  {slots.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                      Sem horários livres neste dia para a duração escolhida.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((t) => {
                        const on = time === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setTime(t);
                              if (noPreference) setBarberId(assignBarberForTime(t));
                            }}
                            className={cn(
                              "h-10 cursor-pointer rounded-lg border font-medium tabular-nums transition-colors",
                              on
                                ? "border-gold bg-gold text-[#101010]"
                                : "border-border text-muted-foreground hover:border-gold/40 hover:text-foreground",
                            )}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <FieldError id="time-error" message={errors.time} />
                </div>
              ) : null}
            </section>
          ) : null}

          {step === "revisao" ? (
            <section className="flex flex-col gap-4">
              <StepHeading title="Confirmar alterações" hint="Revise o resumo e salve." />

              <div className="overflow-hidden rounded-xl border border-border/80 bg-[#121212]">
                <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold/35 bg-gold/10 text-gold">
                    <UserRound className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="label-caps text-[0.6rem] text-muted-foreground">Cliente</p>
                    <p className="truncate font-medium">
                      {customer.mode === "registered" ? customer.selected?.name : WALKIN_CUSTOMER_NAME}
                    </p>
                    {customer.mode === "registered" && customer.selected?.phone ? (
                      <p className="truncate text-xs text-muted-foreground">{maskPhone(customer.selected.phone)}</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-3 border-b border-border/60 px-4 py-3.5 sm:grid-cols-2">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[#0e0e0e] text-gold">
                      <Clock className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="label-caps text-[0.6rem] text-muted-foreground">Quando</p>
                      <p className="text-sm font-medium capitalize">{longDateLabel(date)}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {time && Number.isFinite(startMin) && duration > 0
                          ? `${time} – ${fromMinutes(endMin)}`
                          : time || "—"}
                        <span className="text-muted-foreground/60"> · {formatDuration(duration)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    {noPreference ? (
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/35 bg-gold/10 text-gold">
                        <Users className="size-3.5" aria-hidden="true" />
                      </span>
                    ) : barber ? (
                      <BarberAvatar name={barber.name} url={barber.photoUrl} className="size-8 text-[0.65rem]" />
                    ) : (
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-[#0e0e0e] text-muted-foreground">
                        <UserRound className="size-3.5" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="label-caps text-[0.6rem] text-muted-foreground">Profissional</p>
                      {noPreference ? (
                        <>
                          <p className="truncate text-sm font-medium text-gold">Sem preferência</p>
                          {barber ? (
                            <p className="truncate text-xs text-muted-foreground">Atribuído a {barber.name}</p>
                          ) : null}
                        </>
                      ) : (
                        <p className="truncate text-sm font-medium">{barber?.name ?? "—"}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3.5">
                  <p className="label-caps mb-2.5 text-[0.6rem] text-muted-foreground">Serviços</p>
                  <ul className="flex flex-col gap-2">
                    {lines.map((l) => (
                      <li key={l.id} className="flex items-center gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-gold/20 bg-gold/[0.07] text-gold">
                          <Scissors className="size-3" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatDuration(l.minutes)}
                        </span>
                        <span className="w-16 shrink-0 text-right text-sm tabular-nums">{formatBRL(l.priceCents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-gold/25 bg-gradient-to-r from-gold/[0.08] to-transparent px-4 py-3.5">
                  <div>
                    <p className="label-caps text-[0.6rem] text-muted-foreground">Total</p>
                    <p className="text-xs text-muted-foreground">{formatDuration(sum.minutes)} de serviço</p>
                  </div>
                  <p className="font-heading text-2xl font-semibold tracking-wide text-gold tabular-nums">
                    {formatBRL(sum.priceCents)}
                  </p>
                </div>
              </div>

              <Field id="editNotes" label="Observação (opcional)" error={errors.notes}>
                <Textarea
                  id="editNotes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={NOTES_MAX}
                  rows={2}
                  placeholder="Ex.: prefere a máquina no 2."
                  aria-invalid={errors.notes ? true : undefined}
                />
              </Field>

              {needForce ? (
                <div className="flex flex-col gap-3 rounded-xl border border-gold/35 bg-gold/[0.06] p-4">
                  <p className="text-sm text-muted-foreground">
                    {hoursProblem ?? "Este horário está fora do expediente."}
                  </p>
                  <Switch checked={force} onChange={(e) => setForce(e.target.checked)}>
                    Encaixe fora do expediente
                  </Switch>
                </div>
              ) : null}
            </section>
          ) : null}
        </fieldset>
      </DialogBody>

      <DialogFooter>
        <div className="flex gap-2 sm:order-1">
          <Button type="button" variant="outline" size="lg" onClick={goBack} disabled={pending} className="gap-1.5">
            <ChevronLeft className="size-4" />
            Voltar
          </Button>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:order-2 sm:flex-row">
          {step === "revisao" ? (
            <Button key="salvar" type="submit" variant="luxe" size="lg" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Salvar alterações
            </Button>
          ) : (
            <Button key="continuar" type="button" variant="luxe" size="lg" onClick={goNext} disabled={pending}>
              Continuar
            </Button>
          )}
        </div>
      </DialogFooter>
    </form>
  );
}

function ServiceChecklist({
  services,
  popularIds = [],
  searchable,
  picked,
  minutesOf,
  priceOf,
  onToggle,
  named,
}: {
  services: AgendaService[];
  popularIds?: string[];
  searchable?: boolean;
  picked: string[];
  minutesOf: (id: string) => number;
  priceOf?: (id: string) => number;
  onToggle: (id: string) => void;
  named?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return services;
    return services.filter(
      (s) => s.name.toLowerCase().includes(q) || s.categoryLabel.toLowerCase().includes(q),
    );
  }, [services, q]);

  const popular = useMemo(() => {
    if (q || !searchable) return [];
    const avail = new Set(services.map((s) => s.id));
    const ordered = popularIds.map((id) => services.find((s) => s.id === id)).filter(Boolean) as AgendaService[];
    // Sem histórico: primeiros da lista disponível.
    if (ordered.length === 0) return services.slice(0, Math.min(6, services.length));
    return ordered.filter((s) => avail.has(s.id)).slice(0, 8);
  }, [q, searchable, popularIds, services]);

  const rest = useMemo(() => {
    if (q) return filtered;
    if (!searchable || popular.length === 0) return filtered;
    const top = new Set(popular.map((s) => s.id));
    return filtered.filter((s) => !top.has(s.id));
  }, [q, searchable, popular, filtered]);

  function renderList(items: AgendaService[]) {
    return (
      <ul role="group" aria-label="Serviços do agendamento" className="grid gap-2 sm:grid-cols-2">
        {items.map((s) => {
          const on = picked.includes(s.id);
          const minutes = minutesOf(s.id);
          const price = priceOf?.(s.id) ?? s.priceCents;
          return (
            <li key={s.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  on ? "border-gold/55 bg-gold/[0.08]" : "border-border/80 bg-[#121212] hover:border-gold/35",
                )}
              >
                <input
                  type="checkbox"
                  name={named ? "serviceIds" : undefined}
                  value={s.id}
                  className="sr-only"
                  checked={on}
                  onChange={() => onToggle(s.id)}
                />
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-gold/10 text-gold">
                  <Scissors className="size-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3 text-gold/70" aria-hidden="true" />
                    {formatDuration(minutes)}
                    <span aria-hidden="true">·</span>
                    {formatBRL(price)}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    on ? "border-gold bg-gold text-[#101010]" : "border-border text-transparent",
                  )}
                >
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {searchable ? (
        <div className="group relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
            <Search className="size-4" aria-hidden="true" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar serviço…"
            aria-label="Buscar serviço"
            autoComplete="off"
            className="field-luxe h-11 w-full min-w-0 rounded-lg border border-input pl-11 pr-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>
      ) : null}

      {!q && popular.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="label-caps text-[0.65rem] text-gold/90">Mais acessados</p>
          {renderList(popular)}
        </div>
      ) : null}

      {q ? (
        filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
            Nenhum serviço encontrado para “{query.trim()}”.
          </p>
        ) : (
          renderList(filtered)
        )
      ) : rest.length > 0 ? (
        <div className="flex flex-col gap-2">
          {popular.length > 0 ? <p className="label-caps text-[0.65rem] text-muted-foreground">Todos</p> : null}
          {renderList(rest)}
        </div>
      ) : null}
    </div>
  );
}

function TotalsCard({ sum }: { sum: { minutes: number; priceCents: number } }) {
  return (
    <dl className="grid gap-3 rounded-xl border border-gold/25 bg-gradient-to-br from-gold/[0.07] to-transparent px-4 py-3.5 sm:grid-cols-2">
      <div>
        <dt className="label-caps text-[0.6rem] text-muted-foreground">Duração na agenda</dt>
        <dd className="mt-0.5 text-sm font-medium">{formatDuration(sum.minutes)}</dd>
      </div>
      <div>
        <dt className="label-caps text-[0.6rem] text-muted-foreground">Total</dt>
        <dd className="mt-0.5 font-heading text-xl font-semibold text-gold">{formatBRL(sum.priceCents)}</dd>
      </div>
    </dl>
  );
}

function WizardStepNav({
  steps,
  step,
  stepIndex,
  labels,
}: {
  steps: NewStep[];
  step: NewStep;
  stepIndex: number;
  labels: Record<NewStep, string>;
}) {
  return (
    <nav aria-label="Etapas" className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const done = i < stepIndex;
        const current = s === step;
        return (
          <div key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
            <div
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-center transition-colors",
                current && "border-gold/55 bg-gold/10 text-gold",
                done && "border-gold/30 bg-gold/[0.06] text-foreground",
                !current && !done && "border-border/70 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold",
                  current || done ? "bg-gold text-[#101010]" : "bg-white/[0.06]",
                )}
              >
                {done ? <Check className="size-3 stroke-[3]" /> : i + 1}
              </span>
              <span className="hidden truncate font-label text-[0.65rem] uppercase tracking-wide sm:inline">
                {labels[s]}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <span className="hidden h-px w-2 shrink-0 bg-border sm:block" aria-hidden="true" />
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function StepHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h3 className="font-heading text-lg font-semibold uppercase tracking-wide">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function NoPreferenceSwitch({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3.5 transition-colors",
        checked
          ? "border-gold/50 bg-gradient-to-br from-gold/[0.14] via-gold/[0.05] to-transparent shadow-[inset_0_1px_0_rgb(192_160_98/0.2)]"
          : "border-border/80 bg-[#121212]",
        disabled && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors",
            checked
              ? "border-gold/45 bg-gold/15 text-gold"
              : "border-border bg-[#0e0e0e] text-muted-foreground",
          )}
          aria-hidden="true"
        >
          <Users className="size-4" />
        </span>
        <p className={cn("min-w-0 flex-1 text-sm font-medium", checked ? "text-gold" : "text-foreground")}>
          Cliente sem preferência
        </p>
        <Switch
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
          labelClassName="shrink-0"
          aria-label="Cliente sem preferência"
        />
      </div>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

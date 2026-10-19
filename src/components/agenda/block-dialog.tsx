"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Loader2, Lock } from "lucide-react";
import { createBlockAction, deleteBlockAction } from "@/app/u/[slug]/agenda/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/unit/form-parts";
import type { AgendaBarber, AgendaEntry } from "@/lib/agenda/types";
import { initialAgendaState } from "@/lib/agenda/types";
import { shortDateLabel } from "@/lib/agenda/time";
import { BLOCK_REASON_MAX } from "@/lib/validation/appointment";
import { DialogBody, DialogFooter, DialogShell } from "./dialog-shell";
import { AgendaDateField } from "./mini-calendar";

export type BlockTarget =
  | { kind: "new"; barberId: string; date: string; start: string; end: string }
  | { kind: "view"; entry: AgendaEntry };

type Props = {
  slug: string;
  target: BlockTarget;
  barbers: AgendaBarber[];
  slot: number;
  today: string;
  onClose: () => void;
  onDone: (message: string, date?: string) => void;
};

export function BlockDialog(props: Props) {
  const { target } = props;
  return (
    <DialogShell
      eyebrow={target.kind === "view" ? `Bloqueio · ${shortDateLabel(target.entry.date)}` : "Recepção"}
      title={target.kind === "view" ? "Horário bloqueado" : "Bloquear horário"}
      onClose={props.onClose}
    >
      {target.kind === "view" ? <BlockDetails {...props} entry={target.entry} /> : <BlockForm {...props} target={target} />}
    </DialogShell>
  );
}

function BlockDetails({ slug, entry, barbers, onClose, onDone }: Props & { entry: AgendaEntry }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const barber = barbers.find((b) => b.id === entry.barberId);

  function remove() {
    setError(null);
    start(async () => {
      const r = await deleteBlockAction(slug, entry.id);
      if (r.status === "success") onDone(r.message ?? "Bloqueio removido.");
      else setError(r.message ?? "Não foi possível remover o bloqueio.");
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-[#0b0b0b]/40 p-4">
          <Lock className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              {entry.time} às {entry.endTime}
              {barber ? <span className="text-muted-foreground"> · {barber.name}</span> : null}
            </p>
            <p className="mt-1 text-muted-foreground">{entry.notes ?? "Sem motivo informado."}</p>
            {entry.authorName ? <p className="mt-2 text-xs text-muted-foreground">Criado por {entry.authorName}</p> : null}
          </div>
        </div>
        {error ? <FormAlert tone="error">{error}</FormAlert> : null}
      </DialogBody>
      <DialogFooter className="sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
          Fechar
        </Button>
        {confirm ? (
          <Button type="button" variant="destructive" size="lg" onClick={remove} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Confirmar remoção
          </Button>
        ) : (
          <Button type="button" variant="destructive" size="lg" onClick={() => setConfirm(true)}>
            Remover bloqueio
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function BlockForm({ slug, target, barbers, slot, today, onClose, onDone }: Props & { target: Extract<BlockTarget, { kind: "new" }> }) {
  const [state, action, pending] = useActionState(createBlockAction.bind(null, slug), initialAgendaState);
  const [barberId, setBarberId] = useState(target.barberId);
  const [date, setDate] = useState(target.date);
  const [start, setStart] = useState(target.start);
  const [end, setEnd] = useState(target.end);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (state.status === "success") onDone(state.message ?? "Horário bloqueado.", state.savedDate);
  }, [state, onDone]);

  const errors = state.fieldErrors ?? {};
  const options = [
    { value: "all", label: "Todos os profissionais" },
    ...barbers.filter((b) => !b.inactive).map((b) => ({ value: b.id, label: b.name })),
  ];

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="flex flex-col gap-5">
        {state.status === "error" && state.message ? <FormAlert tone="error">{state.message}</FormAlert> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="block-barber" label="Profissional" error={errors.barberId} className="sm:col-span-3">
            <Select id="block-barber" name="barberId" value={barberId} onValueChange={setBarberId} options={options} invalid={!!errors.barberId} />
          </Field>
          <Field id="block-date" label="Data" error={errors.date}>
            <AgendaDateField
              id="block-date"
              name="date"
              value={date}
              today={today}
              invalid={!!errors.date}
              onChange={setDate}
            />
          </Field>
          <Field id="block-start" label="Início" error={errors.start}>
            <Input id="block-start" name="start" type="time" step={slot * 60} value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={errors.start ? true : undefined} />
          </Field>
          <Field id="block-end" label="Fim" error={errors.end}>
            <Input id="block-end" name="end" type="time" step={slot * 60} value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={errors.end ? true : undefined} />
          </Field>
          <Field id="block-reason" label="Motivo (opcional)" error={errors.reason} className="sm:col-span-3">
            <Input
              id="block-reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={BLOCK_REASON_MAX}
              placeholder="Ex.: consulta médica, curso, manutenção"
              autoComplete="off"
              aria-invalid={errors.reason ? true : undefined}
            />
          </Field>
        </div>
      </DialogBody>
      <DialogFooter className="sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" variant="luxe" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Bloquear
        </Button>
      </DialogFooter>
    </form>
  );
}

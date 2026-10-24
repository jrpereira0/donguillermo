"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  ChevronRight,
  Clock3,
  Plus,
  Receipt,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import {
  cashMovementAction,
  closeRegisterAction,
  createTicketAction,
  openRegisterAction,
} from "@/app/u/[slug]/caixa/actions";
import { DialogShell } from "@/components/agenda/dialog-shell";
import { AgendaDateField } from "@/components/agenda/mini-calendar";
import { CashHistoryPanel } from "./cash-history";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { expectedCash, PAY_METHODS, payMethodLabel } from "@/lib/caixa/math";
import type { CashMovement, CashTicketRow, CatalogBarber, ClosedRegister, MethodTotals, OpenRegister } from "@/lib/caixa/types";
import { cn } from "@/lib/utils";
import type { FormState } from "@/lib/validation/auth";
import { formatBRL, maskMoney, moneyToCents } from "@/lib/validation/service";

const idle: FormState = { status: "idle" };
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" });

const field = "field-luxe h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-sm text-cream outline-none";

function waitingLabel(openedAt: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 60_000));
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  if (h < 24) return rest ? `há ${h} h ${String(rest).padStart(2, "0")}` : `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

function payLabel(t: CashTicketRow) {
  if (!t.payments.length) return "";
  return t.payments
    .map((p) => `${payMethodLabel(p.method)}${p.method === "credito" && p.installments > 1 ? ` ${p.installments}x` : ""}`)
    .join(" · ");
}

const CARD =
  "overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]";

function Panel({
  icon: Icon,
  title,
  value,
  pad = true,
  children,
}: {
  icon: LucideIcon;
  title: string;
  value?: string;
  pad?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(CARD, "flex h-full flex-col")}>
      <header className="flex h-14 items-center gap-3 border-b border-border/80 bg-black/20 px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="min-w-0 flex-1 truncate font-heading text-base font-semibold tracking-wide text-cream uppercase">{title}</h2>
        {value ? <span className="shrink-0 font-heading text-sm font-semibold tabular-nums text-gold">{value}</span> : null}
      </header>
      <div className={cn("flex min-h-0 flex-1 flex-col", pad && "gap-4 p-5")}>{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={cn(CARD, "flex h-full flex-col px-4 py-4")}>
      <p className="label-caps truncate text-[0.62rem]">{label}</p>
      <p className="mt-2 truncate font-heading text-[1.45rem] leading-none font-semibold tabular-nums text-cream">{value}</p>
      <p className="mt-2 truncate text-[0.7rem] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-black/25 px-3.5 py-3">
      <p className="label-caps truncate text-[0.58rem]">{label}</p>
      <p className="mt-1.5 truncate font-heading text-lg leading-none font-semibold tabular-nums text-cream">{value}</p>
      <p className="mt-1.5 h-4 truncate text-[0.68rem] text-muted-foreground">{hint ?? "\u00a0"}</p>
    </div>
  );
}

function BarRow({ label, value, width, meta }: { label: string; value: string; width: number; meta?: string }) {
  return (
    <li>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-muted-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-cream">{value}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold/35 to-gold"
            style={{ width: `${Math.max(width > 0 ? 3 : 0, Math.min(100, width))}%` }}
          />
        </div>
        {meta ? <span className="w-10 shrink-0 text-right text-[0.68rem] tabular-nums text-muted-foreground">{meta}</span> : null}
      </div>
    </li>
  );
}

/**
 * Aviso de formulário que não fica velho na tela: some quando o usuário mexe
 * nos campos do formulário (corrigindo o erro) e tem X para dispensar.
 */
function useFormAlert(state: FormState, editDeps: unknown[]) {
  const [dismissed, setDismissed] = useState<FormState | null>(null);
  useEffect(() => {
    if (state.status === "error") setDismissed(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, editDeps);
  return {
    visible: state.status !== "idle" && !!state.message && state !== dismissed,
    dismiss: () => setDismissed(state),
  };
}

/** Modal de abertura: monta do zero a cada abertura, sem aviso velho da vez anterior. */
function OpenRegisterModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(openRegisterAction.bind(null, slug), idle);
  const [opening, setOpening] = useState("");
  const [openDay, setOpenDay] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()),
  );
  const alert = useFormAlert(state, [opening, openDay]);
  return (
    <DialogShell size="md" eyebrow="Financeiro" title="Abrir caixa" onClose={onClose}>
      <form action={action} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Informe o dinheiro que já está na gaveta (o fundo de troco). Pode ser zero — dá para ajustar depois
            com um suprimento.
          </p>
          {alert.visible ? (
            <FormAlert tone="error" onClose={alert.dismiss}>
              {state.message}
            </FormAlert>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <span className="label-caps text-[0.65rem]">Dia do caixa</span>
            <AgendaDateField
              id="openDay"
              name="businessDate"
              value={openDay}
              today={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}
              onChange={setOpenDay}
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              É o dia a que este caixa pertence. Só pode existir <strong className="font-medium text-cream">um caixa por dia</strong>:
              se esse dia já tiver caixa, é preciso reabrir o daquele dia pelo histórico.
            </span>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="label-caps text-[0.65rem]">Fundo de caixa</span>
            <span className="group relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-sm text-muted-foreground group-focus-within:text-gold">
                R$
              </span>
              <input
                name="opening"
                value={opening}
                onChange={(e) => setOpening(maskMoney(e.target.value))}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Fundo de caixa"
                autoFocus
                className="field-luxe h-12 w-full rounded-lg border border-input pr-3 pl-11 text-base tabular-nums outline-none"
              />
            </span>
          </label>
        </div>
        <div className="mt-auto flex gap-2 border-t border-border/70 bg-[#141414] px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" size="lg" className="flex-1" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant="luxe" size="lg" className="flex-1" disabled={pending}>
            {pending ? "Abrindo…" : "Abrir caixa"}
            <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

/** Sangria/suprimento da gaveta. Montado por caixa (key = registerId): aviso de um caixa não vaza para outro. */
function MovementForm({ slug, registerId, esperado }: { slug: string; registerId: string; esperado: number }) {
  const [state, action, pending] = useActionState(cashMovementAction.bind(null, slug, registerId), idle);
  const [kind, setKind] = useState<"suprimento" | "sangria">("suprimento");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (state.status === "success") {
      setAmount("");
      setNote("");
    }
  }, [state]);
  const alert = useFormAlert(state, [amount, kind, note]);
  const amountCents = moneyToCents(amount) ?? 0;
  const overLimit = kind === "sangria" && amountCents > Math.max(0, esperado);
  return (
    <form action={action} className="flex flex-col gap-3 border-t border-border/70 pt-4">
      {alert.visible ? (
        <FormAlert tone={state.status === "error" ? "error" : "success"} onClose={alert.dismiss}>
          {state.message}
        </FormAlert>
      ) : null}
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border" role="group" aria-label="Tipo de movimento">
        <button
          type="button"
          aria-pressed={kind === "suprimento"}
          onClick={() => setKind("suprimento")}
          className={cn(
            "flex h-10 cursor-pointer items-center justify-center gap-1.5 text-xs",
            kind === "suprimento" ? "bg-gold text-[#1a1408]" : "bg-black/20 text-muted-foreground hover:text-cream",
          )}
        >
          <ArrowDownLeft className="size-3.5" /> Suprimento
        </button>
        <button
          type="button"
          aria-pressed={kind === "sangria"}
          onClick={() => setKind("sangria")}
          className={cn(
            "flex h-10 cursor-pointer items-center justify-center gap-1.5 border-l border-border text-xs",
            kind === "sangria" ? "bg-gold text-[#1a1408]" : "bg-black/20 text-muted-foreground hover:text-cream",
          )}
        >
          <ArrowUpRight className="size-3.5" /> Sangria
        </button>
      </div>
      <input
        name="amount"
        value={amount}
        onChange={(e) => setAmount(maskMoney(e.target.value))}
        inputMode="decimal"
        placeholder="Valor"
        aria-label="Valor do movimento"
        aria-invalid={overLimit || undefined}
        className={cn(field, "tabular-nums")}
      />
      {kind === "sangria" ? (
        overLimit ? (
          <p role="alert" className="text-xs leading-relaxed text-destructive">
            A sangria não pode passar do dinheiro na gaveta ({formatBRL(Math.max(0, esperado))}).
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Na gaveta: <span className="tabular-nums text-cream">{formatBRL(Math.max(0, esperado))}</span> — a sangria não pode passar disso.
          </p>
        )
      ) : null}
      <input
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Motivo (opcional)"
        aria-label="Motivo do movimento"
        className={field}
      />
      <Button type="submit" variant="outline" disabled={pending || overLimit} className="w-full">
        {pending ? "Registrando…" : "Registrar movimento"}
      </Button>
    </form>
  );
}

/** Nova comanda avulsa (balcão). O sucesso redireciona para a comanda; aqui só aparece erro. */
function NewTicketForm({ slug, barbers }: { slug: string; barbers: CatalogBarber[] }) {
  const [state, action, pending] = useActionState(createTicketAction.bind(null, slug), idle);
  const [name, setName] = useState("");
  const [barber, setBarber] = useState("none");
  const alert = useFormAlert(state, [name, barber]);
  const barberOptions = [{ value: "none", label: "Sem profissional" }, ...barbers.map((b) => ({ value: b.id, label: b.name }))];
  return (
    <form action={action} className="flex flex-col gap-3">
      {alert.visible ? (
        <FormAlert tone="error" onClose={alert.dismiss}>
          {state.message}
        </FormAlert>
      ) : null}
      <input
        name="customerName"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do cliente"
        aria-label="Nome do cliente"
        className={field}
      />
      <Select
        name="barberId"
        value={barber}
        onValueChange={setBarber}
        options={barberOptions}
        placeholder="Profissional"
        searchable
        searchPlaceholder="Buscar profissional"
      />
      <Button type="submit" variant="luxe" disabled={pending} className="w-full">
        <Plus /> {pending ? "Abrindo…" : "Abrir comanda"}
      </Button>
    </form>
  );
}

/**
 * Fechamento do caixa. Montado por caixa (key = registerId): o "Caixa fechado."
 * de um fechamento nunca aparece dentro do caixa seguinte.
 */
function CloseRegisterForm({
  slug,
  registerId,
  esperado,
  blockingCount,
  blockingCents,
  waitingCount,
}: {
  slug: string;
  registerId: string;
  esperado: number;
  /** Comandas abertas do dia DESTE caixa: só estas impedem o fechamento. */
  blockingCount: number;
  blockingCents: number;
  /** Comandas abertas de outros dias: ficam esperando o caixa do dia delas. */
  waitingCount: number;
}) {
  const [state, action, pending] = useActionState(closeRegisterAction.bind(null, slug, registerId), idle);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const alert = useFormAlert(state, [counted, notes]);
  const countedCents = counted.trim() === "" ? null : moneyToCents(counted);
  const diff = countedCents === null ? null : countedCents - esperado;
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Conte o dinheiro da gaveta. O esperado é <span className="tabular-nums text-cream">{formatBRL(esperado)}</span>.
      </p>
      {alert.visible ? (
        <FormAlert tone={state.status === "error" ? "error" : "success"} onClose={alert.dismiss}>
          {state.message}
        </FormAlert>
      ) : null}
      <label className="flex flex-col gap-1.5">
        <span className="label-caps text-[0.65rem]">Dinheiro contado</span>
        <input
          name="counted"
          value={counted}
          onChange={(e) => setCounted(maskMoney(e.target.value))}
          inputMode="decimal"
          placeholder="0,00"
          aria-label="Dinheiro contado"
          className={cn(field, "tabular-nums")}
        />
      </label>
      {diff !== null ? (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            diff === 0
              ? "border-success/40 bg-success/10 text-success"
              : "border-gold/40 bg-gold/10 text-gold",
          )}
          aria-live="polite"
        >
          {diff === 0
            ? "Bate com o esperado. Pode fechar."
            : diff > 0
              ? `Sobra ${formatBRL(diff)} na gaveta.`
              : `Falta ${formatBRL(-diff)} na gaveta.`}
        </p>
      ) : null}
      <input
        name="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Observação do fechamento"
        aria-label="Observação do fechamento"
        className={field}
      />
      {blockingCount > 0 ? (
        <p className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-cream">
          Ainda há {blockingCount} {blockingCount === 1 ? "comanda aberta" : "comandas abertas"} do dia deste caixa somando{" "}
          {formatBRL(blockingCents)}. Receba ou cancele antes de fechar.
        </p>
      ) : waitingCount > 0 ? (
        <p className="rounded-lg border border-border bg-black/25 px-3 py-2 text-xs text-muted-foreground">
          {waitingCount === 1
            ? "A comanda de outro dia fica aberta esperando o caixa do dia dela — não precisa cancelar."
            : `As ${waitingCount} comandas de outros dias ficam abertas esperando o caixa do dia delas — não precisa cancelar.`}
        </p>
      ) : null}
      <Button type="submit" variant="luxe" className="w-full" disabled={pending || blockingCount > 0}>
        {pending ? "Fechando…" : "Fechar caixa"}
      </Button>
      <Link href={`/u/${slug}/caixa?aba=historico`} className="link-luxe label-caps inline-flex items-center gap-2 self-center py-1">
        <Receipt className="size-3.5" /> Histórico de caixas
      </Link>
    </form>
  );
}

export function CashDesk({
  slug,
  register,
  methods,
  movements,
  openTickets,
  paidTickets,
  barbers,
  history,
}: {
  slug: string;
  register: OpenRegister | null;
  methods: MethodTotals;
  movements: CashMovement[];
  openTickets: CashTicketRow[];
  paidTickets: CashTicketRow[];
  barbers: CatalogBarber[];
  history: ClosedRegister[];
}) {
  const [openModal, setOpenModal] = useState(false);

  if (!register) {
    return (
      <div className="flex flex-col gap-6">
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-gold/30 bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 px-5 py-5 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
            <Wallet className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="label-caps text-[0.62rem] text-gold">Caixa fechado</p>
            <h2 className="mt-1 font-heading text-xl font-semibold uppercase tracking-wide text-cream">Nenhum caixa aberto</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              As comandas só são recebidas com o caixa aberto.
              {openTickets.length
                ? ` Há ${openTickets.length} ${openTickets.length === 1 ? "comanda aberta esperando" : "comandas abertas esperando"}.`
                : ""}
            </p>
          </div>
          <Button type="button" variant="luxe" size="lg" onClick={() => setOpenModal(true)}>
            <Wallet className="size-4" aria-hidden="true" />
            Abrir caixa
          </Button>
        </section>

        <CashHistoryPanel slug={slug} history={history} />

        {openModal ? <OpenRegisterModal slug={slug} onClose={() => setOpenModal(false)} /> : null}
      </div>
    );
  }

  const suprimento = movements.filter((m) => m.kind === "suprimento").reduce((n, m) => n + m.amountCents, 0);
  const sangria = movements.filter((m) => m.kind === "sangria").reduce((n, m) => n + m.amountCents, 0);
  const esperado = expectedCash({
    openingCents: register.openingCents,
    suprimentoCents: suprimento,
    sangriaCents: sangria,
    dinheiroCents: methods.dinheiro,
  });
  const recebido = methods.dinheiro + methods.pix + methods.debito + methods.credito;
  const aReceber = openTickets.reduce((n, t) => n + t.totalCents, 0);
  const gorjetas = paidTickets.reduce((n, t) => n + t.tipCents, 0);
  const descontos = paidTickets.reduce((n, t) => n + t.discountCents, 0);
  // Faturado é a receita da barbearia: total recebido SEM a gorjeta (que é do barbeiro).
  const faturado = Math.max(0, recebido - gorjetas);
  const ticketMedio = paidTickets.length ? Math.round(faturado / paidTickets.length) : 0;

  // Caixa esquecido aberto de outro dia: as comandas de hoje não entram nele
  // (só no caixa do dia delas) — a recepção precisa ver isso de cara.
  const spDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  const todaySP = spDayFmt.format(new Date());
  const staleRegister = register.businessDate < todaySP;
  const futureRegister = register.businessDate > todaySP;
  const staleLabel =
    register.businessDate === spDayFmt.format(new Date(Date.now() - 86_400_000))
      ? "ontem"
      : dateFmt.format(new Date(`${register.businessDate}T12:00:00`));
  const todayOpenCount = openTickets.filter((t) => spDayFmt.format(new Date(t.openedAt)) === todaySP).length;
  // Só as comandas do dia DESTE caixa impedem o fechamento; as dos outros
  // dias ficam abertas esperando o caixa delas (mesma regra da RPC).
  const dayOpenTickets = openTickets.filter((t) => spDayFmt.format(new Date(t.openedAt)) === register.businessDate);
  const dayOpenCents = dayOpenTickets.reduce((n, t) => n + t.totalCents, 0);

  const payBase = Math.max(recebido, 1);

  return (
    <div className="flex flex-col gap-4">
      {staleRegister || futureRegister ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-2xl border border-gold/40 bg-gold/10 px-5 py-4"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/15 text-gold">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-semibold uppercase tracking-wide text-gold">
              {staleRegister
                ? `O caixa de ${staleLabel} ainda está aberto`
                : `O caixa aberto é de ${dateFmt.format(new Date(`${register.businessDate}T12:00:00`))}`}
            </h2>
            <p className="mt-0.5 text-sm leading-relaxed text-cream/80">
              As comandas de hoje só podem ser recebidas no caixa de hoje.
              {todayOpenCount
                ? ` Há ${todayOpenCount} ${todayOpenCount === 1 ? "comanda de hoje esperando" : "comandas de hoje esperando"}.`
                : ""}{" "}
              Feche este caixa para abrir o de hoje.
            </p>
          </div>
          <a href="#fechar-caixa" className={buttonVariants({ variant: "luxe", size: "lg" })}>
            Fechar este caixa
          </a>
        </div>
      ) : null}

      <div className={cn(CARD, "flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3")}>
        <span className="inline-flex items-center gap-2 text-sm text-cream">
          <span className="size-2 rounded-full bg-success shadow-[0_0_8px_rgb(143_191_106/0.8)]" aria-hidden="true" />
          Caixa aberto
        </span>
        <span className="text-xs text-muted-foreground">
          Referente a {dateFmt.format(new Date(`${register.businessDate}T12:00:00`))} · aberto às{" "}
          {timeFmt.format(new Date(register.openedAt))}
          {register.openedByName ? ` por ${register.openedByName}` : ""}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Fundo <span className="tabular-nums text-cream">{formatBRL(register.openingCents)}</span>
        </span>
      </div>

      <section className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Resumo do caixa">
        <Kpi
          label="Faturado"
          value={formatBRL(faturado)}
          hint={paidTickets.length ? `${paidTickets.length} ${paidTickets.length === 1 ? "comanda" : "comandas"} · sem gorjeta` : "Nenhuma comanda recebida"}
        />
        <Kpi label="Ticket médio" value={formatBRL(ticketMedio)} hint="Por comanda recebida" />
        <Kpi
          label="A receber"
          value={formatBRL(aReceber)}
          hint={
            openTickets.length
              ? `${openTickets.length} ${openTickets.length === 1 ? "aberta" : "abertas"} · mais antiga ${waitingLabel(openTickets[0]!.openedAt)}`
              : "Nenhuma comanda aberta"
          }
        />
        <Kpi
          label="Gorjetas"
          value={formatBRL(gorjetas)}
          hint={descontos ? `Descontos ${formatBRL(descontos)}` : "Dos profissionais"}
        />
        <Kpi label="Na gaveta" value={formatBRL(esperado)} hint="O que deve ter ao fechar" />
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <Panel icon={Wallet} title="Formas de pagamento" value={formatBRL(recebido)}>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Faturado" value={formatBRL(faturado)} hint="Sem gorjeta" />
            <Tile label="Gorjetas" value={formatBRL(gorjetas)} hint="Fora do faturado" />
            <Tile label="Descontos" value={formatBRL(descontos)} hint="Nas recebidas" />
          </div>
          <ul className="flex flex-col gap-3.5">
            {PAY_METHODS.map((m) => {
              const cents = methods[m.value];
              const pct = recebido > 0 ? Math.round((cents / recebido) * 100) : 0;
              return (
                <BarRow
                  key={m.value}
                  label={m.label}
                  value={formatBRL(cents)}
                  width={(cents / payBase) * 100}
                  meta={`${pct}%`}
                />
              );
            })}
          </ul>
        </Panel>

        <Panel icon={Banknote} title="Gaveta" value={formatBRL(esperado)}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="Fundo" value={formatBRL(register.openingCents)} hint="Na abertura" />
            <Tile label="Dinheiro" value={formatBRL(methods.dinheiro)} hint="Vendas" />
            <Tile label="Suprimentos" value={formatBRL(suprimento)} />
            <Tile label="Sangrias" value={formatBRL(sangria)} />
          </div>
          <MovementForm key={register.id} slug={slug} registerId={register.id} esperado={esperado} />
          {movements.length > 0 ? (
            <ul className="scroll-luxe flex max-h-44 flex-col gap-1 overflow-y-auto border-t border-border/70 pt-3 pr-1">
              {movements.map((m) => (
                <li key={m.id} className="flex items-baseline justify-between gap-2 py-1 text-xs">
                  <span className="min-w-0 text-muted-foreground">
                    <span className="tabular-nums">{timeFmt.format(new Date(m.createdAt))}</span>{" "}
                    {m.kind === "sangria" ? "Sangria" : "Suprimento"}
                    {m.note ? ` · ${m.note}` : ""}
                  </span>
                  <span className={cn("shrink-0 tabular-nums", m.kind === "sangria" ? "text-destructive" : "text-success")}>
                    {m.kind === "sangria" ? "−" : "+"}
                    {formatBRL(m.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>

      <Panel icon={Clock3} title="A receber agora" value={String(openTickets.length)} pad={false}>
        {openTickets.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhuma comanda aberta. As que forem abertas na agenda aparecem aqui, da mais antiga para a mais nova.
          </p>
        ) : (
          <ul>
            <li className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_7rem_7.5rem_1rem] gap-3 border-b border-border/60 px-5 py-2 lg:grid">
              {["Cliente", "Itens", "Espera", "Total", ""].map((h, i) => (
                <span key={h} className={cn("label-caps text-[0.58rem]", i === 3 && "text-right")}>
                  {h}
                </span>
              ))}
            </li>
            {openTickets.map((t) => (
              <li key={t.id} className="border-b border-border/50 last:border-b-0">
                <Link
                  href={`/u/${slug}/caixa/comanda/${t.id}`}
                  className="group grid items-center gap-1 px-4 py-3.5 transition-colors hover:bg-gold/[0.05] sm:px-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_7rem_7.5rem_1rem] lg:gap-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-cream group-hover:text-gold">{t.customerName}</span>
                    {t.barberName ? <span className="block truncate text-xs text-muted-foreground lg:hidden">{t.barberName}</span> : null}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {t.barberName ? <span className="hidden lg:inline">{t.barberName} · </span> : null}
                    {t.items.length ? t.items.join(", ") : "Sem itens ainda"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {timeFmt.format(new Date(t.openedAt))}
                    <span className="text-gold/80"> · {waitingLabel(t.openedAt)}</span>
                  </span>
                  <span className="text-sm tabular-nums text-gold lg:text-right">{formatBRL(t.totalCents)}</span>
                  <ChevronRight className="hidden size-4 text-muted-foreground group-hover:text-gold lg:block" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel icon={Receipt} title="Recebidas neste caixa" value={String(paidTickets.length)} pad={false}>
        {paidTickets.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Ainda não entrou pagamento neste caixa.</p>
        ) : (
          <ul>
            <li className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_8rem_7.5rem_1rem] gap-3 border-b border-border/60 px-5 py-2 lg:grid">
              {["Cliente", "Pagamento", "Horário", "Total", ""].map((h, i) => (
                <span key={h} className={cn("label-caps text-[0.58rem]", i === 3 && "text-right")}>
                  {h}
                </span>
              ))}
            </li>
            {paidTickets.map((t) => (
              <li key={t.id} className="border-b border-border/50 last:border-b-0">
                <Link
                  href={`/u/${slug}/caixa/comanda/${t.id}`}
                  className="group grid items-center gap-1 px-4 py-3.5 transition-colors hover:bg-gold/[0.05] sm:px-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_8rem_7.5rem_1rem] lg:gap-3"
                >
                  <span className="truncate text-sm font-medium text-cream group-hover:text-gold">{t.customerName}</span>
                  <span className="truncate text-xs text-muted-foreground">{payLabel(t) || t.items.join(", ") || "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.closedAt ? timeFmt.format(new Date(t.closedAt)) : "—"}
                    {t.tipCents ? <span className="text-gold/80"> · gorjeta {formatBRL(t.tipCents)}</span> : null}
                  </span>
                  <span className="text-sm tabular-nums text-cream lg:text-right">{formatBRL(t.totalCents)}</span>
                  <ChevronRight className="hidden size-4 text-muted-foreground group-hover:text-gold lg:block" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <Panel icon={Plus} title="Nova comanda">
          <NewTicketForm slug={slug} barbers={barbers} />
        </Panel>
        <div id="fechar-caixa" className="scroll-mt-6">
          <Panel icon={Receipt} title="Fechar caixa" value={formatBRL(esperado)}>
            <CloseRegisterForm
              key={register.id}
              slug={slug}
              registerId={register.id}
              esperado={esperado}
              blockingCount={dayOpenTickets.length}
              blockingCents={dayOpenCents}
              waitingCount={openTickets.length - dayOpenTickets.length}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

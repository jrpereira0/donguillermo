"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, CreditCard, Minus, Plus, QrCode, Receipt, RotateCcw, Trash2, Wallet } from "lucide-react";
import { chargeTicketAction, reopenTicketAction, saveTicketAction } from "@/app/u/[slug]/caixa/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PAY_METHODS, payMethodLabel, ticketTotals, type PayMethod } from "@/lib/caixa/math";
import type { CatalogBarber, CatalogProduct, CatalogService, TicketDetail, TicketLine } from "@/lib/caixa/types";
import type { FormState } from "@/lib/validation/auth";
import { centsToInput, formatBRL, maskMoney, moneyToCents } from "@/lib/validation/service";
import { cn } from "@/lib/utils";

const idle: FormState = { status: "idle" };
type PayLine = { method: PayMethod; amount: string; installments: number };
type TipLine = { barberId: string; amount: string };
type Row = TicketLine & { key: string };

const MAX_PAYS = 4;
const PARCELAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function maskPercent(input: string) {
  const cleaned = input.replace(/[^\d,]/g, "");
  const [whole, frac] = cleaned.split(",");
  const next = frac === undefined ? (whole ?? "").slice(0, 3) : `${(whole ?? "").slice(0, 3)},${frac.slice(0, 1)}`;
  const n = Number(next.replace(",", "."));
  if (next && Number.isFinite(n) && n > 100) return "100";
  return next;
}

function percentToCents(input: string, subtotal: number) {
  const n = Number(input.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || subtotal <= 0) return 0;
  return Math.min(subtotal, Math.round((subtotal * Math.min(n, 100)) / 100));
}

function centsToPercent(cents: number, subtotal: number) {
  if (cents <= 0 || subtotal <= 0) return "";
  const pct = Math.min(100, Math.round((cents / subtotal) * 1000) / 10);
  return String(pct).replace(".", ",");
}

const field =
  "field-luxe h-11 min-w-0 rounded-lg border border-input bg-transparent px-3 text-sm text-cream outline-none";

function newKey() {
  return crypto.randomUUID();
}

export function TicketEditor({
  slug,
  ticket,
  services,
  products,
  barbers,
  registerOpen,
  registerDay,
  onCharged,
  onSaved,
  onReopened,
  variant = "modal",
}: {
  slug: string;
  ticket: TicketDetail;
  services: CatalogService[];
  products: CatalogProduct[];
  barbers: CatalogBarber[];
  registerOpen: boolean;
  /** Dia de referência (yyyy-mm-dd) do caixa aberto; a comanda só fecha no caixa do dia dela. */
  registerDay?: string | null;
  onCharged?: (message: string) => void;
  onSaved?: (message: string) => void;
  onReopened?: (message: string) => void;
  /** modal = dentro do DialogShell da agenda; page = página da comanda no caixa (painéis da área da unidade). */
  variant?: "modal" | "page";
}) {
  const page = variant === "page";
  const ticketDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(ticket.openedAt),
  );
  const dayMismatch = registerOpen && !!registerDay && registerDay !== ticketDay;
  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(
      new Date(`${iso}T12:00:00`),
    );
  const router = useRouter();
  const closed = ticket.status !== "aberta";
  const [lines, setLines] = useState<Row[]>(() =>
    ticket.lines.map((l, i) => ({
      ...l,
      key: `linha-${i}`,
      kind: l.kind ?? "servico",
      barberId: l.barberId ?? ticket.barberId,
    })),
  );
  const [discountMode, setDiscountMode] = useState<"valor" | "percent">("valor");
  const [discount, setDiscount] = useState(ticket.discountCents ? centsToInput(ticket.discountCents) : "");
  const [discountPct, setDiscountPct] = useState("");
  const [tips, setTips] = useState<TipLine[]>(() =>
    ticket.tips.map((t) => ({ barberId: t.barberId, amount: centsToInput(t.amountCents) })),
  );
  const [tipOpen, setTipOpen] = useState(false);
  const [tipEdit, setTipEdit] = useState<number | null>(null);
  const [tipAmount, setTipAmount] = useState("");
  const [tipBarber, setTipBarber] = useState("");
  const [notes, setNotes] = useState(ticket.notes ?? "");
  const [pays, setPays] = useState<PayLine[]>(() => {
    if (ticket.payments.length) {
      return ticket.payments.map((p) => ({
        method: p.method,
        amount: centsToInput(p.amountCents),
        installments: p.method === "credito" ? p.installments || 1 : 1,
      }));
    }
    const start = ticketTotals(
      ticket.lines.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
      ticket.discountCents,
      ticket.tipCents,
    );
    return [{ method: "dinheiro", amount: start.total ? centsToInput(start.total) : "", installments: 1 }];
  });
  const [payLocked, setPayLocked] = useState(ticket.payments.length > 0);
  const [servicePick, setServicePick] = useState(0);
  const [productPick, setProductPick] = useState(0);

  const [saveState, saveAction, savePending] = useActionState(saveTicketAction.bind(null, slug, ticket.id), idle);
  const [chargeState, chargeAction, chargePending] = useActionState(chargeTicketAction.bind(null, slug, ticket.id), idle);
  const [reopenState, reopenAction, reopenPending] = useActionState(reopenTicketAction.bind(null, slug, ticket.id), idle);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const pending = savePending || chargePending;
  const state = chargeState.status !== "idle" ? chargeState : saveState;

  useEffect(() => {
    if (reopenState.status !== "success") return;
    if (onReopened) onReopened(reopenState.message ?? "Comanda reaberta.");
    else router.refresh();
  }, [reopenState, onReopened, router]);

  useEffect(() => {
    if (chargeState.status === "success") onCharged?.(chargeState.message ?? "Comanda fechada.");
  }, [chargeState, onCharged]);

  useEffect(() => {
    if (saveState.status === "success") onSaved?.(saveState.message ?? "Comanda salva.");
  }, [saveState, onSaved]);

  const subtotalCents = lines.reduce((n, l) => n + l.quantity * l.unitPriceCents, 0);
  const discountCents =
    discountMode === "percent"
      ? percentToCents(discountPct, subtotalCents)
      : Math.min(moneyToCents(discount || "0") ?? 0, Math.max(0, subtotalCents));
  const tipCents = tips.reduce((n, t) => n + (moneyToCents(t.amount) ?? 0), 0);
  const totals = useMemo(() => ticketTotals(lines, discountCents, tipCents), [lines, discountCents, tipCents]);
  const afterDiscount = Math.max(0, totals.subtotal - totals.discount);
  const ticketBarber = lines.find((l) => l.barberId)?.barberId ?? ticket.barberId ?? "";

  function chooseDiscountMode(next: "valor" | "percent") {
    if (next === discountMode) return;
    if (next === "percent") setDiscountPct(centsToPercent(moneyToCents(discount || "0") ?? 0, subtotalCents));
    else setDiscount(discountCents ? centsToInput(discountCents) : "");
    setDiscountMode(next);
  }

  useEffect(() => {
    if (payLocked || pays.length !== 1) return;
    const next = totals.total ? centsToInput(totals.total) : "";
    setPays((cur) =>
      cur[0] && cur[0].amount === next
        ? cur
        : [{ method: cur[0]?.method ?? "dinheiro", amount: next, installments: cur[0]?.installments ?? 1 }],
    );
  }, [totals.total, payLocked, pays.length]);

  const payloadItems = JSON.stringify(
    lines.map((l) => ({
      kind: l.kind,
      serviceId: l.kind === "produto" ? null : l.serviceId,
      name: l.name.trim(),
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      barberId: l.barberId,
    })),
  );
  const payloadPays = JSON.stringify(
    totals.total === 0
      ? []
      : pays
          .map((p) => ({
            method: p.method,
            amountCents: moneyToCents(p.amount) ?? 0,
            installments: p.method === "credito" ? p.installments : 1,
          }))
          .filter((p) => p.amountCents > 0),
  );
  const payloadTips = JSON.stringify(
    tips
      .map((t) => ({ barberId: t.barberId, amountCents: moneyToCents(t.amount) ?? 0 }))
      .filter((t) => t.barberId && t.amountCents > 0),
  );
  const paid = totals.total === 0 ? 0 : pays.reduce((n, p) => n + (moneyToCents(p.amount) ?? 0), 0);
  const rest = totals.total - paid;
  const linesReady = lines.length > 0 && lines.every((l) => l.name.trim().length > 0);
  const barberOptions = [
    ...barbers.map((b) => ({ value: b.id, label: b.name })),
    { value: "none", label: "Sem profissional" },
  ];
  const tipBarberOptions = barbers.map((b) => ({ value: b.id, label: b.name }));
  const tipDraftCents = moneyToCents(tipAmount) ?? 0;
  const serviceOptions = services.map((s) => ({ value: s.id, label: `${s.name} · ${formatBRL(s.priceCents)}` }));
  const productOptions = products.map((p) => ({ value: p.id, label: `${p.name} · ${formatBRL(p.priceCents)}` }));

  function patch(i: number, next: Partial<Row>) {
    setLines((cur) => cur.map((x, j) => (j === i ? { ...x, ...next } : x)));
  }

  function addService(id: string) {
    const svc = services.find((s) => s.id === id);
    if (!svc) return;
    const barberId = lines.at(-1)?.barberId ?? ticket.barberId;
    setLines((cur) => [
      ...cur,
      { key: newKey(), kind: "servico", serviceId: svc.id, name: svc.name, quantity: 1, unitPriceCents: svc.priceCents, barberId },
    ]);
  }

  function openTip(index: number | null) {
    const current = index === null ? null : tips[index];
    setTipEdit(index);
    setTipAmount(current?.amount ?? "");
    setTipBarber(current?.barberId || lines.find((l) => l.barberId)?.barberId || ticket.barberId || "");
    setTipOpen(true);
  }

  function confirmTip() {
    const cents = moneyToCents(tipAmount) ?? 0;
    if (!tipBarber || cents < 1) return;
    const next = { barberId: tipBarber, amount: centsToInput(cents) };
    setTips((cur) => {
      const without = tipEdit === null ? cur : cur.filter((_, i) => i !== tipEdit);
      const at = without.findIndex((t) => t.barberId === tipBarber);
      if (at >= 0) return without.map((t, i) => (i === at ? next : t));
      return [...without, next];
    });
    setTipOpen(false);
    setTipEdit(null);
  }

  function addProduct(id: string) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const barberId = lines.at(-1)?.barberId ?? ticket.barberId;
    setLines((cur) => [
      ...cur,
      {
        key: newKey(),
        kind: "produto",
        serviceId: null,
        name: product.name,
        quantity: 1,
        unitPriceCents: product.priceCents,
        barberId,
      },
    ]);
  }

  if (closed) {
    const methodIcon = { dinheiro: Banknote, pix: QrCode, debito: CreditCard, credito: CreditCard } as const;
    const closedFmt = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
    return (
      <div
        className={
          page
            ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]"
            : "grid items-start gap-4 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_21rem]"
        }
      >
        <section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
          <header className="flex items-center gap-3 border-b border-border/80 bg-black/20 px-4 py-3 sm:px-5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              <Receipt className="size-4" aria-hidden="true" />
            </span>
            <h3 className="min-w-0 flex-1 font-heading text-base font-semibold uppercase tracking-wide text-cream">
              Itens da comanda
            </h3>
            <span className="label-caps shrink-0 text-[0.62rem]">
              {lines.length} {lines.length === 1 ? "item" : "itens"}
            </span>
          </header>
          {lines.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">Nenhum item lançado.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-cream">{l.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {l.kind === "produto" ? "Produto" : "Serviço"}
                      {barbers.find((b) => b.id === l.barberId)?.name
                        ? ` · ${barbers.find((b) => b.id === l.barberId)?.name}`
                        : ""}
                      {l.quantity > 1 ? ` · ${l.quantity} × ${formatBRL(l.unitPriceCents)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-gold">
                    {formatBRL(l.quantity * l.unitPriceCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {ticket.notes ? (
            <div className="border-t border-border/70 px-4 py-3.5 sm:px-5">
              <p className="label-caps text-[0.6rem]">Observação</p>
              <p className="mt-1 text-sm text-muted-foreground">{ticket.notes}</p>
            </div>
          ) : null}
        </section>

        <aside
          className={cn(
            "flex flex-col overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]",
            page && "lg:sticky lg:top-6",
          )}
        >
          <header className="flex items-center gap-3 border-b border-gold/20 bg-black/20 px-5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              <Wallet className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="label-caps text-[0.6rem] text-gold">{ticket.status === "fechada" ? "Recebido" : "Resumo"}</p>
              <h3 className="font-heading text-base font-semibold uppercase tracking-wide text-cream">Pagamento</h3>
            </div>
            {ticket.closedAt ? (
              <span className="shrink-0 text-[0.7rem] text-muted-foreground">{closedFmt.format(new Date(ticket.closedAt))}</span>
            ) : null}
          </header>

          <div className="flex flex-col gap-1.5 px-5 py-4 text-sm">
            <span className="flex justify-between gap-3 py-1 text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums text-cream">{formatBRL(totals.subtotal)}</span>
            </span>
            {totals.discount ? (
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Desconto</span>
                <span className="tabular-nums">− {formatBRL(totals.discount)}</span>
              </span>
            ) : null}
            {ticket.tips.length
              ? ticket.tips.map((t) => (
                  <span key={`${t.barberId}-${t.amountCents}`} className="flex justify-between gap-3 py-1 text-muted-foreground">
                    <span>Gorjeta · {t.barberName ?? barbers.find((b) => b.id === t.barberId)?.name ?? "Profissional"}</span>
                    <span className="tabular-nums text-gold">{formatBRL(t.amountCents)}</span>
                  </span>
                ))
              : totals.tip
                ? (
                    <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                      <span>Gorjeta</span>
                      <span className="tabular-nums text-gold">{formatBRL(totals.tip)}</span>
                    </span>
                  )
                : null}

            {ticket.payments.length ? (
              <div className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3">
                <p className="label-caps text-[0.6rem]">Formas de pagamento</p>
                {ticket.payments.map((p, i) => {
                  const Icon = methodIcon[p.method];
                  return (
                    <span key={`${p.method}-${i}`} className="flex items-center gap-2.5 text-muted-foreground">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-black/30 text-gold">
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        {payMethodLabel(p.method)}
                        {p.method === "credito" ? (p.installments > 1 ? ` em ${p.installments}×` : " à vista") : ""}
                      </span>
                      <span className="tabular-nums text-cream">{formatBRL(p.amountCents)}</span>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">Nenhum pagamento registrado.</p>
            )}

            <span className="mt-3 flex items-end justify-between gap-3 border-t border-gold/25 pt-3">
              <span className="label-caps text-[0.62rem] text-gold">Total</span>
              <span className="font-heading text-3xl leading-none tabular-nums text-gold">{formatBRL(totals.total)}</span>
            </span>
          </div>

          {ticket.status === "fechada" ? (
            <div className="border-t border-gold/20 bg-black/20 px-5 py-4">
              {reopenState.status === "error" && reopenState.message ? (
                <FormAlert tone="error">{reopenState.message}</FormAlert>
              ) : null}
              {confirmReopen ? (
                <form action={reopenAction} className="flex flex-col gap-3 rounded-xl border border-gold/35 bg-gold/[0.06] px-4 py-3">
                  <p className="text-sm text-cream">Reabrir esta comanda?</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Os pagamentos lançados serão desfeitos, a comanda volta a ficar aberta e o agendamento sai de
                    concluído na agenda. Só é possível enquanto o caixa desta cobrança estiver aberto.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="luxe" size="sm" disabled={reopenPending}>
                      <RotateCcw />
                      {reopenPending ? "Reabrindo…" : "Sim, reabrir"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReopen(false)} disabled={reopenPending}>
                      Manter cobrada
                    </Button>
                  </div>
                </form>
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => setConfirmReopen(true)}>
                  <RotateCcw />
                  Reabrir comanda
                </Button>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    );
  }

  return (
    <form
      action={chargeAction}
      className={
        page
          ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]"
          : "grid min-h-0 flex-1 overflow-hidden md:grid-cols-[minmax(0,1.2fr)_minmax(22rem,26rem)]"
      }
    >
      <input type="hidden" name="items" value={payloadItems} />
      <input type="hidden" name="payments" value={payloadPays} />
      <input type="hidden" name="barberId" value={ticketBarber} />
      <input type="hidden" name="discount" value={discountCents ? centsToInput(discountCents) : ""} />
      <input type="hidden" name="tip" value={tipCents ? centsToInput(tipCents) : ""} />
      <input type="hidden" name="tips" value={payloadTips} />

      <div
        className={
          page
            ? "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]"
            : "flex min-w-0 flex-col gap-3 px-5 py-4 sm:px-6"
        }
      >
        {page ? (
          <header className="flex items-center gap-3 border-b border-border/80 bg-black/20 px-4 py-3 sm:px-5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              <Receipt className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-heading text-base font-semibold uppercase tracking-wide text-cream">Itens da comanda</h3>
              <p className="text-[0.7rem] text-muted-foreground">Profissional, preço e quantidade de cada serviço ou produto.</p>
            </div>
            <span className="label-caps shrink-0 text-[0.62rem]">
              {lines.length} {lines.length === 1 ? "item" : "itens"}
            </span>
          </header>
        ) : null}

        <div className={page ? "flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5" : "contents"}>
        {state.status !== "idle" && state.message ? (
          <FormAlert tone={state.status === "error" ? "error" : "success"}>{state.message}</FormAlert>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Select
            key={`servico-${servicePick}`}
            value=""
            onValueChange={(id) => {
              addService(id);
              setServicePick((n) => n + 1);
            }}
            options={serviceOptions}
            placeholder="Adicionar serviço"
            searchable
            button
            searchPlaceholder="Buscar serviço"
            disabled={!services.length}
          />
          <Select
            key={`produto-${productPick}`}
            value=""
            onValueChange={(id) => {
              addProduct(id);
              setProductPick((n) => n + 1);
            }}
            options={productOptions}
            placeholder="Adicionar produto"
            searchable
            button
            searchPlaceholder="Buscar produto"
            disabled={!products.length}
          />
        </div>

        {page ? null : (
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-heading text-sm font-semibold uppercase tracking-[0.16em] text-cream">Itens</h3>
            <p className="text-xs text-muted-foreground">Profissional, preço e quantidade de cada um</p>
          </div>
        )}

        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Nada lançado. Adicione um serviço ou um produto.
          </p>
        ) : (
          <ul className={page ? "flex flex-col gap-2" : "scroll-luxe flex max-h-[min(22rem,46dvh)] flex-col gap-2 overflow-y-auto pr-2"}>
            {lines.map((l, i) => (
              <li key={l.key} className="rounded-xl border border-border/80 bg-[#121212] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-cream">{l.name}</p>
                  <span className="shrink-0 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-gold/80">
                    {l.kind === "produto" ? "Produto" : "Serviço"}
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-gold">
                    {formatBRL(l.quantity * l.unitPriceCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                    className="rounded-md p-1 text-muted-foreground hover:text-rose-300"
                    aria-label={`Excluir ${l.name || "item"}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_7.25rem_auto] items-center gap-2">
                  <Select
                    value={l.barberId ?? "none"}
                    onValueChange={(v) => patch(i, { barberId: v === "none" ? null : v })}
                    options={barberOptions}
                    placeholder="Profissional"
                    searchable
                    searchPlaceholder="Buscar profissional"
                  />
                  <input
                    value={l.unitPriceCents ? centsToInput(l.unitPriceCents) : ""}
                    onChange={(e) => patch(i, { unitPriceCents: moneyToCents(maskMoney(e.target.value)) ?? 0 })}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label={`Preço de ${l.name || "item"}`}
                    className={cn(field, "text-right tabular-nums")}
                  />
                  <span className="flex h-11 items-center gap-0.5 rounded-lg border border-input bg-[rgb(8_8_8/0.5)] px-1">
                    <button
                      type="button"
                      className="flex size-8 cursor-pointer items-center justify-center rounded-md text-cream hover:bg-gold/10 hover:text-gold"
                      onClick={() => patch(i, { quantity: Math.max(1, l.quantity - 1) })}
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm tabular-nums text-cream">{l.quantity}</span>
                    <button
                      type="button"
                      className="flex size-8 cursor-pointer items-center justify-center rounded-md text-cream hover:bg-gold/10 hover:text-gold"
                      onClick={() => patch(i, { quantity: Math.min(20, l.quantity + 1) })}
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Observação
          <textarea
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Opcional"
            className="field-luxe resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-cream"
          />
        </label>
        </div>
      </div>

      <aside
        className={
          page
            ? "flex flex-col overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)] lg:sticky lg:top-6"
            : "flex min-h-0 flex-col overflow-hidden border-t border-gold/25 bg-[#12110e] md:border-t-0 md:border-l"
        }
      >
        <div className={page ? "flex flex-col gap-4 px-5 py-5" : "scroll-luxe flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"}>
        {page ? (
          <header className="-mx-5 -mt-5 flex items-center gap-3 border-b border-gold/20 bg-black/20 px-5 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              <Wallet className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="label-caps text-[0.6rem] text-gold">Cobrança</p>
              <h3 className="font-heading text-base font-semibold uppercase tracking-wide text-cream">Fechar conta</h3>
            </div>
          </header>
        ) : (
          <header>
            <p className="label-caps text-[0.62rem] text-gold">Cobrança</p>
            <h3 className="font-heading text-lg font-semibold uppercase tracking-[0.14em] text-cream">Fechar conta</h3>
          </header>
        )}

        <section className="rounded-2xl border border-border bg-gradient-to-b from-[#262626]/80 to-[#141414] px-4 py-3 shadow-[inset_0_1px_0_rgb(242_237_228/0.05)]">
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="label-caps text-[0.62rem]">Subtotal</span>
            <span className="text-sm tabular-nums text-cream">{formatBRL(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="label-caps text-[0.62rem]">Desconto</span>
            <div className="flex items-center gap-1.5">
              <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="Tipo de desconto">
                <button
                  type="button"
                  aria-pressed={discountMode === "valor"}
                  onClick={() => chooseDiscountMode("valor")}
                  className={cn(
                    "h-9 w-9 cursor-pointer text-xs",
                    discountMode === "valor" ? "bg-gold text-[#1a1408]" : "text-muted-foreground hover:text-cream",
                  )}
                >
                  R$
                </button>
                <button
                  type="button"
                  aria-pressed={discountMode === "percent"}
                  onClick={() => chooseDiscountMode("percent")}
                  className={cn(
                    "h-9 w-9 cursor-pointer border-l border-border text-xs",
                    discountMode === "percent" ? "bg-gold text-[#1a1408]" : "text-muted-foreground hover:text-cream",
                  )}
                >
                  %
                </button>
              </div>
              {discountMode === "percent" ? (
                <input
                  value={discountPct}
                  onChange={(e) => setDiscountPct(maskPercent(e.target.value))}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Desconto em porcentagem"
                  className={cn(field, "h-9 w-16 text-right text-sm tabular-nums")}
                />
              ) : (
                <input
                  value={discount}
                  onChange={(e) => setDiscount(maskMoney(e.target.value))}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label="Desconto em reais"
                  className={cn(field, "h-9 w-28 text-right text-sm tabular-nums")}
                />
              )}
            </div>
          </div>
          {discountMode === "percent" && discountCents > 0 ? (
            <p className="-mt-1 pb-1 text-right text-[0.65rem] tabular-nums text-muted-foreground">− {formatBRL(discountCents)}</p>
          ) : null}

          <div className="border-t border-border/80 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="label-caps text-[0.62rem]">Gorjeta</span>
              <button type="button" onClick={() => openTip(null)} className="cursor-pointer text-xs text-gold hover:underline">
                {tips.length ? "Adicionar outra" : "Adicionar"}
              </button>
            </div>
            {tips.map((t, i) => (
              <div key={`${t.barberId}-${i}`} className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => openTip(i)} className="min-w-0 flex-1 cursor-pointer text-left">
                  <span className="block truncate text-sm text-cream">{barbers.find((b) => b.id === t.barberId)?.name ?? "Profissional"}</span>
                </button>
                <span className="text-sm tabular-nums text-gold">{formatBRL(moneyToCents(t.amount) ?? 0)}</span>
                <button
                  type="button"
                  aria-label="Remover gorjeta"
                  onClick={() => setTips((cur) => cur.filter((_, j) => j !== i))}
                  className="rounded-md p-1 text-muted-foreground hover:text-rose-300"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {tipOpen ? (
              <div className="mt-3 flex flex-col gap-3 border-t border-gold/20 pt-3">
                <div className="grid grid-cols-3 gap-1.5">
                  {[10, 15, 20].map((pct) => {
                    const cents = Math.round((afterDiscount * pct) / 100);
                    const on = tipDraftCents === cents && cents > 0;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setTipAmount(cents ? centsToInput(cents) : "")}
                        className={cn(
                          "flex cursor-pointer flex-col items-center justify-center rounded-lg border py-1.5 text-sm tabular-nums leading-none",
                          on ? "border-gold bg-gold text-[#1a1408]" : "border-border text-muted-foreground hover:border-gold/40 hover:text-cream",
                        )}
                      >
                        {pct}%
                        <span className="mt-0.5 block text-[0.65rem] opacity-80">{cents ? formatBRL(cents) : "—"}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  Outro valor
                  <input
                    value={tipAmount}
                    onChange={(e) => setTipAmount(maskMoney(e.target.value))}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label="Valor da gorjeta"
                    className={cn(field, "h-9 w-28 text-right text-sm tabular-nums")}
                  />
                </label>
                {tipBarberOptions.length ? (
                  <Select
                    value={tipBarber}
                    onValueChange={setTipBarber}
                    options={tipBarberOptions}
                    placeholder="Profissional"
                    searchable
                    searchPlaceholder="Buscar profissional"
                  />
                ) : (
                  <p className="text-xs text-amber-200">Cadastre um profissional para lançar a gorjeta.</p>
                )}
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={confirmTip} disabled={!tipBarber || tipDraftCents < 1}>
                    {tipEdit === null ? "Incluir" : "Atualizar"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setTipOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-1 flex items-end justify-between border-t border-gold/25 pt-3">
            <span className="label-caps text-[0.65rem] text-gold">Total</span>
            <span className="font-heading text-[2rem] leading-none text-gold tabular-nums">{formatBRL(totals.total)}</span>
          </div>
        </section>

        {!dayMismatch && registerOpen ? (
          <section className="flex flex-col gap-3">
            <h4 className="label-caps text-[0.62rem]">Recebimento</h4>
            {pays.map((p, i) => (
              <div key={i} className="flex flex-col gap-3">
                {pays.length > 1 ? (
                  <div className="flex items-center justify-between">
                    <span className="label-caps text-[0.62rem]">Forma {i + 1}</span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-rose-300"
                      onClick={() => {
                        setPayLocked(true);
                        setPays((cur) => cur.filter((_, j) => j !== i));
                      }}
                    >
                      Remover
                    </button>
                  </div>
                ) : null}
                <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-border" role="group" aria-label={pays.length > 1 ? `Forma ${i + 1}` : "Forma de pagamento"}>
                  {PAY_METHODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() =>
                        setPays((cur) =>
                          cur.map((x, j) =>
                            j === i ? { ...x, method: m.value, installments: m.value === "credito" ? x.installments || 1 : 1 } : x,
                          ),
                        )
                      }
                      className={cn(
                        "h-10 cursor-pointer border-r border-border text-xs last:border-r-0",
                        p.method === m.value ? "bg-gold text-[#1a1408]" : "bg-black/20 text-muted-foreground hover:text-cream",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-between gap-3">
                  <span className="label-caps text-[0.62rem]">Valor</span>
                  <input
                    value={p.amount}
                    onChange={(e) => {
                      setPayLocked(true);
                      const amount = maskMoney(e.target.value);
                      setPays((cur) => cur.map((x, j) => (j === i ? { ...x, amount } : x)));
                    }}
                    inputMode="decimal"
                    aria-label={`Valor do pagamento ${i + 1}`}
                    className={cn(field, "h-10 w-36 text-right text-base tabular-nums")}
                  />
                </label>
                {p.method === "credito" ? (
                  <div className="flex flex-col gap-2">
                    <span className="label-caps text-[0.62rem]">Parcelas no crédito</span>
                    <div className="grid grid-cols-6 gap-1">
                      {PARCELAS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setPays((cur) => cur.map((x, j) => (j === i ? { ...x, installments: n } : x)))}
                          className={cn(
                            "h-8 cursor-pointer rounded-md border text-xs tabular-nums",
                            p.installments === n
                              ? "border-gold bg-gold text-[#1a1408]"
                              : "border-border text-muted-foreground hover:border-gold/40 hover:text-cream",
                          )}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {pays.length < MAX_PAYS ? (
              <button
                type="button"
                onClick={() => {
                  setPayLocked(true);
                  const missing = Math.max(0, rest);
                  setPays((cur) => [...cur, { method: "pix", amount: missing ? centsToInput(missing) : "", installments: 1 }]);
                }}
                className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gold/40 text-xs text-gold hover:border-gold hover:bg-gold/10"
              >
                <Plus className="size-3.5" />
                Dividir em outra forma
              </button>
            ) : null}
            {rest !== 0 ? (
              <p className="text-xs text-amber-200">
                {rest > 0 ? `Falta ${formatBRL(rest)} para fechar.` : `Excede o total em ${formatBRL(-rest)}.`}
              </p>
            ) : null}
          </section>
        ) : dayMismatch ? (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs leading-relaxed text-amber-100">
            O caixa aberto é de <strong className="font-medium">{dayLabel(registerDay!)}</strong> e esta comanda é
            de <strong className="font-medium">{dayLabel(ticketDay)}</strong>. Ela só pode ser recebida no caixa do
            dia dela: feche o caixa atual e abra ou reabra o caixa de {dayLabel(ticketDay)}. Salvar as alterações
            continua liberado.
          </p>
        ) : (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-100">
            Abra o caixa do dia para receber. A comanda pode ser salva antes.
          </p>
        )}

        </div>
        <div
          className={
            page
              ? "flex flex-col gap-2 border-t border-gold/20 bg-black/20 px-5 py-4"
              : "flex shrink-0 flex-col gap-2 border-t border-gold/20 bg-[#12110e] px-5 py-4"
          }
        >
          <Button type="submit" variant="luxe" size="lg" className="w-full" disabled={pending || !registerOpen || dayMismatch || !linesReady || rest !== 0}>
            Receber {formatBRL(totals.total)}
            <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
          </Button>
          <Button type="submit" formAction={saveAction} variant="outline" size="lg" className="w-full" disabled={pending || !linesReady}>
            Salvar comanda
          </Button>
        </div>
      </aside>
    </form>
  );
}

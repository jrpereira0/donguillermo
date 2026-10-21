"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, CheckCircle2, Clock3, CreditCard, Layers, Minus, Plus, QrCode, Receipt, RotateCcw, Trash2, TriangleAlert, Wallet } from "lucide-react";
import { chargeTicketAction, reopenTicketAction, saveTicketAction } from "@/app/u/[slug]/caixa/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PAY_METHODS, payMethodLabel, ticketTotals, type PayMethod } from "@/lib/caixa/math";
import type { CatalogBarber, CatalogProduct, CatalogService, TicketDetail, TicketLine, TicketPackageOption, TicketPackageSaleOption } from "@/lib/caixa/types";
import type { FormState } from "@/lib/validation/auth";
import { centsToInput, formatBRL, maskMoney, moneyToCents } from "@/lib/validation/service";
import { cn } from "@/lib/utils";

const idle: FormState = { status: "idle" };
/** method "" = nenhuma forma escolhida ainda (nunca nasce pré-marcada). */
type PayLine = { method: PayMethod | ""; amount: string; installments: number };
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

/** Serviço pelo pacote: vinculado ao pacote do cliente ou ao pacote sendo vendido nesta comanda. */
const isCovered = (l: TicketLine) => l.kind === "servico" && (!!l.customerPackageId || !!l.packageId);
const isSale = (l: TicketLine) => l.kind === "pacote";

export function TicketEditor({
  slug,
  ticket,
  services,
  products,
  barbers,
  packages = [],
  salePackages = [],
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
  /** Pacotes ativos do cliente desta comanda (saldo sem contar esta comanda). */
  packages?: TicketPackageOption[];
  /** Catálogo de pacotes vendável nesta comanda. */
  salePackages?: TicketPackageSaleOption[];
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
      customerPackageId: l.customerPackageId ?? null,
      packageId: l.packageId ?? null,
      packageName: l.packageName ?? null,
    })),
  );
  const [discountMode, setDiscountMode] = useState<"valor" | "percent">("valor");
  const [discount, setDiscount] = useState(ticket.discountCents ? centsToInput(ticket.discountCents) : "");
  const [discountPct, setDiscountPct] = useState("");
  /** Desconto de 100%: cobrar exige confirmar que a comanda sai de graça. */
  const [confirmFree, setConfirmFree] = useState(false);
  /** Aviso ao tentar fechar sem escolher a forma de pagamento. */
  const [payAlert, setPayAlert] = useState(false);
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
      ticket.lines.map((l) => ({
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        packageCovered: isCovered(l),
      })),
      ticket.discountCents,
      ticket.tipCents,
    );
    return [{ method: "", amount: start.total ? centsToInput(start.total) : "", installments: 1 }];
  });
  const [payLocked, setPayLocked] = useState(ticket.payments.length > 0);
  const [servicePick, setServicePick] = useState(0);
  const [productPick, setProductPick] = useState(0);
  const [salePick, setSalePick] = useState(0);

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

  const subtotalCents = lines.reduce((n, l) => n + (isCovered(l) ? 0 : l.quantity * l.unitPriceCents), 0);
  const coveredCents = lines.reduce((n, l) => n + (isCovered(l) ? l.quantity * l.unitPriceCents : 0), 0);
  const discountCents =
    discountMode === "percent"
      ? percentToCents(discountPct, subtotalCents)
      : Math.min(moneyToCents(discount || "0") ?? 0, Math.max(0, subtotalCents));
  // O que foi digitado em R$ pode passar do subtotal: o aplicado trava no
  // subtotal e o campo é corrigido ao sair, com aviso enquanto estiver acima.
  const discountTypedCents = moneyToCents(discount || "0") ?? 0;
  const discountOverLimit = discountMode === "valor" && discountTypedCents > Math.max(0, subtotalCents);
  const tipCents = tips.reduce((n, t) => n + (moneyToCents(t.amount) ?? 0), 0);
  const totals = useMemo(
    () =>
      ticketTotals(
        lines.map((l) => ({ quantity: l.quantity, unitPriceCents: l.unitPriceCents, packageCovered: isCovered(l) })),
        discountCents,
        tipCents,
      ),
    [lines, discountCents, tipCents],
  );
  const afterDiscount = Math.max(0, totals.subtotal - totals.discount);
  // Zerar SÓ por desconto (item de pacote não entra no subtotal, não dispara).
  const freeByDiscount = totals.subtotal > 0 && totals.discount >= totals.subtotal;

  // A confirmação de "sair de graça" desarma se desconto ou subtotal mudarem.
  useEffect(() => {
    setConfirmFree(false);
  }, [discountCents, subtotalCents]);
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
        : [{ method: cur[0]?.method ?? "", amount: next, installments: cur[0]?.installments ?? 1 }],
    );
  }, [totals.total, payLocked, pays.length]);

  const payloadItems = JSON.stringify(
    lines.map((l) => ({
      kind: l.kind,
      serviceId: l.kind === "servico" ? l.serviceId : null,
      name: l.name.trim(),
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      barberId: l.barberId,
      customerPackageId: l.customerPackageId,
      packageId: l.packageId,
    })),
  );
  const paid = totals.total === 0 ? 0 : pays.reduce((n, p) => n + (moneyToCents(p.amount) ?? 0), 0);
  const rest = totals.total - paid;
  const paidNonCash = pays
    .filter((p) => p.method && p.method !== "dinheiro")
    .reduce((n, p) => n + (moneyToCents(p.amount) ?? 0), 0);
  // Troco: pagou a mais e o excesso cabe no dinheiro (cartão/pix não dão troco).
  const troco = totals.total > 0 && rest < 0 && paidNonCash <= totals.total ? -rest : 0;
  const exceedsNonCash = totals.total > 0 && paidNonCash > totals.total;

  const payloadPays = JSON.stringify(
    totals.total === 0
      ? []
      : (() => {
          // Linha sem forma escolhida não é pagamento ainda (não vai no envio).
          // O troco sai do dinheiro: o valor gravado é o aplicado à conta,
          // não o que o cliente entregou em espécie.
          const rows = pays
            .map((p) => ({
              method: p.method,
              amountCents: moneyToCents(p.amount) ?? 0,
              installments: p.method === "credito" ? p.installments : 1,
            }))
            .filter((p) => p.amountCents > 0 && p.method);
          let sobra = troco;
          for (let i = rows.length - 1; i >= 0 && sobra > 0; i--) {
            if (rows[i].method !== "dinheiro") continue;
            const cut = Math.min(sobra, rows[i].amountCents);
            rows[i].amountCents -= cut;
            sobra -= cut;
          }
          return rows.filter((p) => p.amountCents > 0);
        })(),
  );
  const payloadTips = JSON.stringify(
    tips
      .map((t) => ({ barberId: t.barberId, amountCents: moneyToCents(t.amount) ?? 0 }))
      .filter((t) => t.barberId && t.amountCents > 0),
  );
  // Fechar exige forma escolhida em toda linha com valor (nada pré-marcado).
  const missingMethod = totals.total > 0 && pays.some((p) => !p.method && (moneyToCents(p.amount) ?? 0) > 0);

  useEffect(() => {
    if (!missingMethod) setPayAlert(false);
  }, [missingMethod]);
  const linesReady = lines.length > 0 && lines.every((l) => l.name.trim().length > 0);
  // Serviço sem profissional perde a comissão: tem que escolher quem fez —
  // vale para serviço comum e para uso de pacote. (A venda do pacote, ao
  // contrário, nunca tem profissional: a linha é do tipo "pacote".)
  const coveredMissingBarber = lines.filter((l) => l.kind === "servico" && !l.barberId);
  const barberOptions = [
    ...barbers.map((b) => ({ value: b.id, label: b.name })),
    { value: "none", label: "Sem profissional" },
  ];
  const tipBarberOptions = barbers.map((b) => ({ value: b.id, label: b.name }));
  const tipDraftCents = moneyToCents(tipAmount) ?? 0;
  const serviceOptions = services.map((s) => ({ value: s.id, label: `${s.name} · ${formatBRL(s.priceCents)}` }));
  const productOptions = products.map((p) => ({ value: p.id, label: `${p.name} · ${formatBRL(p.priceCents)}` }));

  // Saldo do pacote já descontando o que esta comanda (rascunho) está usando.
  const packageOptions = packages.flatMap((cp) =>
    cp.items.map((i) => {
      const inThisTicket = lines
        .filter((l) => isCovered(l) && l.customerPackageId === cp.customerPackageId && l.serviceId === i.serviceId)
        .reduce((n, l) => n + l.quantity, 0);
      const remaining = i.remaining - inThisTicket;
      return {
        value: `${cp.customerPackageId}:${i.serviceId}`,
        label: `${i.serviceName} · ${cp.packageName} (restam ${remaining})`,
        remaining,
      };
    }),
  );
  // Serviços do pacote que está sendo VENDIDO nesta comanda: dá para usar hoje
  // mesmo, sem cobrar (o pacote ativa ao cobrar; o uso já baixa do saldo).
  const saleUseOptions = lines
    .filter((l) => isSale(l) && l.packageId)
    .flatMap((saleLine) => {
      const tpl = salePackages.find((p) => p.packageId === saleLine.packageId);
      if (!tpl) return [];
      return tpl.items.map((i) => {
        const usedHere = lines
          .filter((x) => isCovered(x) && x.packageId === tpl.packageId && x.serviceId === i.serviceId)
          .reduce((n, x) => n + x.quantity, 0);
        return {
          value: `sale:${tpl.packageId}:${i.serviceId}`,
          label: `${i.serviceName} · ${tpl.name} (comprando agora · restam ${i.quantity - usedHere})`,
          remaining: i.quantity - usedHere,
        };
      });
    });
  function packageRemaining(cpId: string, serviceId: string): number {
    const opt = packageOptions.find((o) => o.value === `${cpId}:${serviceId}`);
    return opt?.remaining ?? 0;
  }

  // Painel visível na comanda: o que o cliente já tem (ou está comprando agora),
  // quanto resta de cada serviço e o botão para usar sem sair da tela.
  const packageBlocks = [
    ...packages.map((cp) => ({
      key: cp.customerPackageId,
      title: cp.packageName,
      badge: "Pacote do cliente",
      buying: false,
      items: cp.items.map((i) => ({
        name: i.serviceName,
        total: i.quantityTotal,
        remaining: packageRemaining(cp.customerPackageId, i.serviceId),
        value: `${cp.customerPackageId}:${i.serviceId}`,
      })),
    })),
    ...salePackages
      .filter((p) => lines.some((l) => isSale(l) && l.packageId === p.packageId))
      .map((p) => ({
        key: `sale-${p.packageId}`,
        title: p.name,
        badge: "Comprando agora",
        buying: true,
        items: p.items.map((i) => ({
          name: i.serviceName,
          total: i.quantity,
          remaining: saleUseOptions.find((o) => o.value === `sale:${p.packageId}:${i.serviceId}`)?.remaining ?? 0,
          value: `sale:${p.packageId}:${i.serviceId}`,
        })),
      })),
  ];
  /** Teto de quantidade de uma linha "pelo pacote" (não passar do saldo). */
  function maxQtyFor(l: Row): number {
    if (!isCovered(l)) return 20;
    if (l.packageId) {
      const tpl = salePackages.find((p) => p.packageId === l.packageId);
      const item = tpl?.items.find((i) => i.serviceId === l.serviceId);
      if (tpl && item) {
        const usedOthers = lines
          .filter((x) => x.key !== l.key && isCovered(x) && x.packageId === l.packageId && x.serviceId === l.serviceId)
          .reduce((n, x) => n + x.quantity, 0);
        return Math.max(1, item.quantity - usedOthers);
      }
    }
    if (l.customerPackageId && l.serviceId) return l.quantity + packageRemaining(l.customerPackageId, l.serviceId);
    return 20;
  }

  /**
   * Pacote que pode baixar ESTA linha (serviço avulso que já está na comanda):
   * primeiro os pacotes ativos do cliente; depois o que está comprando agora.
   */
  function eligibleSource(l: Row) {
    if (l.kind !== "servico" || isCovered(l) || !l.serviceId) return null;
    for (const cp of packages) {
      const item = cp.items.find((i) => i.serviceId === l.serviceId);
      if (!item) continue;
      const remaining = packageRemaining(cp.customerPackageId, l.serviceId);
      if (remaining > 0) {
        return {
          customerPackageId: cp.customerPackageId as string | null,
          packageId: null as string | null,
          packageName: cp.packageName,
          remaining,
          unitPriceCents: item.unitPriceCents,
        };
      }
    }
    for (const saleLine of lines) {
      if (!isSale(saleLine) || !saleLine.packageId) continue;
      const tpl = salePackages.find((p) => p.packageId === saleLine.packageId);
      const item = tpl?.items.find((i) => i.serviceId === l.serviceId);
      if (!tpl || !item) continue;
      const usedHere = lines
        .filter((x) => isCovered(x) && x.packageId === tpl.packageId && x.serviceId === l.serviceId)
        .reduce((n, x) => n + x.quantity, 0);
      const remaining = item.quantity - usedHere;
      if (remaining > 0) {
        return {
          customerPackageId: saleLine.customerPackageId,
          packageId: tpl.packageId as string | null,
          packageName: tpl.name,
          remaining,
          unitPriceCents: item.unitPriceCents,
        };
      }
    }
    return null;
  }

  /** Baixa a linha pelo pacote (para de cobrar) ou volta a cobrar separado. */
  function convertLine(i: number, toPackage: boolean) {
    const l = lines[i];
    if (!l) return;
    if (!toPackage) {
      patch(i, { customerPackageId: null, packageId: null, packageName: null });
      return;
    }
    const src = eligibleSource(l);
    if (!src) return;
    patch(i, {
      customerPackageId: src.customerPackageId,
      packageId: src.packageId,
      packageName: src.packageName,
      unitPriceCents: src.unitPriceCents,
      quantity: Math.min(l.quantity, src.remaining),
    });
  }

  function removeLine(l: Row) {
    setLines((cur) =>
      cur.filter((x) => {
        if (x.key === l.key) return false;
        // Excluir a venda desfaz também os usos lançados daquele pacote aqui.
        if (isSale(l) && isCovered(x) && x.packageId === l.packageId) return false;
        return true;
      }),
    );
  }

  const saleOptions = salePackages.map((p) => ({
    value: p.packageId,
    label: `${p.name} · ${formatBRL(p.priceCents)} (${p.totalServices} ${p.totalServices === 1 ? "serviço" : "serviços"}${p.discountPct > 0 ? `, −${String(p.discountPct).replace(".", ",")}%` : ""})`,
  }));

  function addPackageSale(packageId: string) {
    const pkg = salePackages.find((p) => p.packageId === packageId);
    if (!pkg) return;
    setLines((cur) => [
      ...cur,
      {
        key: newKey(),
        kind: "pacote",
        serviceId: null,
        name: pkg.name,
        quantity: 1,
        unitPriceCents: pkg.priceCents,
        // Venda de pacote não é serviço executado: sem profissional, sem comissão.
        // A comissão nasce depois, quando o cliente usar cada serviço do pacote.
        barberId: null,
        customerPackageId: null,
        packageId: pkg.packageId,
        packageName: pkg.name,
      },
    ]);
  }

  function addPackageUse(value: string) {
    const barberId = lines.at(-1)?.barberId ?? ticket.barberId;
    if (value.startsWith("sale:")) {
      const [, packageId, serviceId] = value.split(":");
      const tpl = salePackages.find((p) => p.packageId === packageId);
      const item = tpl?.items.find((i) => i.serviceId === serviceId);
      const saleLine = lines.find((l) => isSale(l) && l.packageId === packageId);
      if (!tpl || !item || !saleLine) return;
      const usedHere = lines
        .filter((x) => isCovered(x) && x.packageId === packageId && x.serviceId === serviceId)
        .reduce((n, x) => n + x.quantity, 0);
      if (usedHere >= item.quantity) return;
      setLines((cur) => [
        ...cur,
        {
          key: newKey(),
          kind: "servico",
          serviceId: item.serviceId,
          name: item.serviceName,
          quantity: 1,
          unitPriceCents: item.unitPriceCents,
          barberId,
          customerPackageId: saleLine.customerPackageId,
          packageId: tpl.packageId,
          packageName: tpl.name,
        },
      ]);
      return;
    }
    const [cpId, serviceId] = value.split(":");
    const cp = packages.find((p) => p.customerPackageId === cpId);
    const item = cp?.items.find((i) => i.serviceId === serviceId);
    if (!cp || !item || packageRemaining(cpId!, serviceId!) <= 0) return;
    setLines((cur) => [
      ...cur,
      {
        key: newKey(),
        kind: "servico",
        serviceId: item.serviceId,
        name: item.serviceName,
        quantity: 1,
        unitPriceCents: item.unitPriceCents,
        barberId,
        customerPackageId: cp.customerPackageId,
        packageId: null,
        packageName: cp.packageName,
      },
    ]);
  }

  function patch(i: number, next: Partial<Row>) {
    setLines((cur) => cur.map((x, j) => (j === i ? { ...x, ...next } : x)));
  }

  function addService(id: string) {
    const svc = services.find((s) => s.id === id);
    if (!svc) return;
    const barberId = lines.at(-1)?.barberId ?? ticket.barberId;
    setLines((cur) => [
      ...cur,
      {
        key: newKey(),
        kind: "servico",
        serviceId: svc.id,
        name: svc.name,
        quantity: 1,
        unitPriceCents: svc.priceCents,
        barberId,
        customerPackageId: null,
        packageId: null,
        packageName: null,
      },
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
        customerPackageId: null,
        packageId: null,
        packageName: null,
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
                      {isSale(l)
                        ? "Venda de pacote"
                        : isCovered(l)
                          ? `Pelo pacote${l.packageName ? ` ${l.packageName}` : ""} · já pago`
                          : l.kind === "produto"
                            ? "Produto"
                            : "Serviço"}
                      {barbers.find((b) => b.id === l.barberId)?.name
                        ? ` · ${barbers.find((b) => b.id === l.barberId)?.name}`
                        : ""}
                      {l.quantity > 1 ? ` · ${l.quantity} × ${formatBRL(l.unitPriceCents)}` : ""}
                    </span>
                  </span>
                  {isCovered(l) ? (
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      <span className="text-xs tabular-nums text-muted-foreground line-through">
                        {formatBRL(l.quantity * l.unitPriceCents)}
                      </span>
                      <span className="text-sm font-medium tabular-nums text-gold">{formatBRL(0)}</span>
                    </span>
                  ) : (
                    <span className="shrink-0 text-sm font-medium tabular-nums text-gold">
                      {formatBRL(l.quantity * l.unitPriceCents)}
                    </span>
                  )}
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
            {totals.coveredCents > 0 ? (
              <span className="flex justify-between gap-3 py-1 text-muted-foreground">
                <span>Pelo pacote (já pago)</span>
                <span className="tabular-nums text-gold/90">{formatBRL(totals.coveredCents)}</span>
              </span>
            ) : null}
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
          ? "grid items-start gap-6 lg:min-h-0 lg:flex-1 lg:items-stretch lg:grid-cols-[minmax(0,1fr)_24rem]"
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
            ? "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]"
            : "flex min-h-0 min-w-0 flex-col gap-2 px-4 py-3 sm:px-5"
        }
      >
        {page ? (
          <header className="flex items-center gap-2.5 border-b border-border/80 bg-black/20 px-4 py-2.5 sm:px-5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
              <Receipt className="size-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-heading text-sm font-semibold uppercase tracking-wide text-cream">Itens da comanda</h3>
            </div>
            <span className="label-caps shrink-0 text-[0.62rem]">
              {lines.length} {lines.length === 1 ? "item" : "itens"}
            </span>
          </header>
        ) : null}

        <div className={page ? "flex min-h-0 flex-1 flex-col gap-2.5 px-4 py-3 sm:px-5" : "contents"}>
        {state.status !== "idle" && state.message ? (
          <FormAlert tone={state.status === "error" ? "error" : "success"}>{state.message}</FormAlert>
        ) : null}

        {packageBlocks.length ? (
          <section
            aria-label="Pacotes do cliente"
            className="shrink-0 overflow-hidden rounded-lg border border-gold/25 bg-gold/[0.05]"
          >
            {/* Sem rolagem aqui: todos os pacotes ficam sempre visíveis.
                A única rolagem da comanda é a lista de itens. */}
            <div className="divide-y divide-white/5">
              {packageBlocks.map((block) => {
                const totalRemaining = block.items.reduce((n, i) => n + Math.max(0, i.remaining), 0);
                const onlyItem = block.items.length === 1 ? block.items[0] : null;
                return (
                  <div key={block.key} className={cn("px-2.5 py-1.5", block.buying && "bg-amber-300/[0.04]")}>
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                          block.buying
                            ? "border-amber-300/25 bg-amber-300/10 text-amber-300"
                            : "border-emerald-300/25 bg-emerald-300/10 text-emerald-300",
                        )}
                      >
                        {block.buying ? (
                          <Clock3 className="size-3.5" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[0.78rem] font-semibold text-cream">{block.title}</span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-1 py-px text-[0.55rem] font-semibold tracking-wide uppercase",
                              block.buying
                                ? "border-amber-300/25 bg-amber-300/10 text-amber-200"
                                : "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
                            )}
                          >
                            {block.buying ? "Novo nesta comanda" : "Ativo"}
                          </span>
                          {onlyItem ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={onlyItem.remaining <= 0}
                              onClick={() => addPackageUse(onlyItem.value)}
                              className={cn(
                                "ml-auto h-6 shrink-0 px-2",
                                block.buying
                                  ? "border-amber-300/40 text-amber-200 hover:bg-amber-300/10 hover:text-amber-100"
                                  : "border-gold/40 text-gold hover:bg-gold/10 hover:text-gold",
                              )}
                            >
                              <Plus />
                              Usar
                            </Button>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[0.7rem] leading-4 text-muted-foreground">
                          {onlyItem
                            ? `${onlyItem.name} · restam ${Math.max(0, onlyItem.remaining)} de ${onlyItem.total}${block.buying ? " · ativa ao cobrar" : ""}`
                            : `${totalRemaining} ${totalRemaining === 1 ? "restante" : "restantes"}`}
                        </p>
                      </div>
                    </div>

                    {!onlyItem ? (
                      <div className="mt-1.5 flex flex-wrap gap-1 pl-8">
                        {block.items.map((item) => (
                          <span
                            key={item.value}
                            className="flex min-h-6 items-center gap-1.5 rounded-md bg-black/25 py-0.5 pr-0.5 pl-2"
                          >
                            <span className="text-[0.68rem] leading-tight text-cream">
                              {item.name}
                              <span className="tabular-nums text-muted-foreground">
                                {" "}· restam {Math.max(0, item.remaining)} de {item.total}
                              </span>
                            </span>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={item.remaining <= 0}
                              onClick={() => addPackageUse(item.value)}
                              className={cn(
                                "h-5 shrink-0 px-1.5",
                                block.buying
                                  ? "border-amber-300/40 text-amber-200 hover:bg-amber-300/10 hover:text-amber-100"
                                  : "border-gold/40 text-gold hover:bg-gold/10 hover:text-gold",
                              )}
                            >
                              <Plus />
                              Usar
                            </Button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <div
          className={cn(
            "grid shrink-0 grid-cols-2 gap-1 rounded-xl border border-border/80 bg-black/25 p-1",
            salePackages.length && ticket.customerId && "min-[560px]:grid-cols-3",
          )}
        >
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
            className="h-8 border-transparent bg-transparent px-2 text-[0.62rem] tracking-[0.12em] shadow-none hover:border-gold/30 hover:bg-gold/10 data-[state=open]:border-gold/40 data-[state=open]:bg-gold/10"
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
            className="h-8 border-transparent bg-transparent px-2 text-[0.62rem] tracking-[0.12em] shadow-none hover:border-gold/30 hover:bg-gold/10 data-[state=open]:border-gold/40 data-[state=open]:bg-gold/10"
          />
          {salePackages.length && ticket.customerId ? (
            <Select
              key={`venda-pacote-${salePick}`}
              value=""
              onValueChange={(id) => {
                addPackageSale(id);
                setSalePick((n) => n + 1);
              }}
              options={saleOptions}
              placeholder="Vender pacote"
              searchable
              button
              searchPlaceholder="Buscar pacote"
              className="col-span-2 h-8 border-transparent bg-transparent px-2 text-[0.62rem] tracking-[0.12em] shadow-none hover:border-gold/30 hover:bg-gold/10 min-[560px]:col-span-1 data-[state=open]:border-gold/40 data-[state=open]:bg-gold/10"
            />
          ) : null}
        </div>

        {salePackages.length && !ticket.customerId ? (
          <p className="flex min-h-8 items-center rounded-lg border border-dashed border-border px-2.5 py-1 text-[0.68rem] leading-snug text-muted-foreground">
            Para vender um pacote, vincule um cliente cadastrado a esta comanda.
          </p>
        ) : null}

        {coveredMissingBarber.length ? (
          <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
            Escolha o profissional de {coveredMissingBarber.map((l) => l.name).join(", ")}: serviço sem profissional
            perde a comissão de quem fez.
          </p>
        ) : null}

        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
            Nada lançado. Adicione um serviço ou um produto.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-[#101010]">
            {!page ? (
              <div className="flex h-8 shrink-0 items-center justify-between border-b border-border/70 bg-white/[0.02] px-3">
                <span className="label-caps text-[0.6rem]">Itens lançados</span>
                <span className="text-[0.68rem] tabular-nums text-muted-foreground">
                  {lines.length} {lines.length === 1 ? "item" : "itens"} · {formatBRL(subtotalCents)}
                </span>
              </div>
            ) : null}
            <ul className="scroll-luxe flex min-h-0 flex-1 flex-col divide-y divide-border/70 overflow-y-auto">
            {lines.map((l, i) => (
              <li key={l.key} className="px-3 py-2.5 transition-colors hover:bg-white/[0.015]">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.86rem] leading-5 font-semibold text-cream">{l.name}</p>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.65rem] leading-none text-muted-foreground">
                      <span className="font-medium tracking-[0.06em] text-gold/75 uppercase">
                        {isSale(l)
                          ? "Venda de pacote"
                          : isCovered(l)
                            ? `Pacote${l.packageName ? ` · ${l.packageName}` : ""}`
                            : l.kind === "produto"
                              ? "Produto"
                              : "Serviço"}
                      </span>
                      {isSale(l) ? <span>Ativa ao cobrar · sem comissão sobre a venda</span> : null}
                      {isCovered(l) ? (
                        <>
                          <span className="text-gold/90">sem cobrança</span>
                          <button
                            type="button"
                            onClick={() => convertLine(i, false)}
                            className="cursor-pointer font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-gold hover:underline"
                          >
                            Cobrar separado
                          </button>
                        </>
                      ) : eligibleSource(l) ? (
                        <button
                          type="button"
                          onClick={() => convertLine(i, true)}
                          className="flex h-5 cursor-pointer items-center gap-1 rounded-full border border-gold/40 px-1.5 font-medium text-gold transition-colors hover:border-gold hover:bg-gold/10"
                        >
                          <Layers className="size-3" aria-hidden="true" />
                          Usar do pacote · restam {eligibleSource(l)!.remaining}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isCovered(l) ? (
                    <span className="flex shrink-0 items-baseline gap-1.5 pt-0.5 text-right">
                      <span className="text-[0.7rem] tabular-nums text-muted-foreground line-through">
                        {formatBRL(l.quantity * l.unitPriceCents)}
                      </span>
                      <span className="font-heading text-[0.95rem] font-medium tabular-nums text-gold">{formatBRL(0)}</span>
                    </span>
                  ) : (
                    <span className="w-[4.5rem] shrink-0 pt-0.5 text-right font-heading text-[0.95rem] font-medium tabular-nums text-gold">
                      {formatBRL(l.quantity * l.unitPriceCents)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeLine(l)}
                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                    aria-label={`Excluir ${l.name || "item"}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                {isSale(l) ? null : (
                  <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/5 bg-black/25 p-1">
                    <Select
                      value={l.barberId ?? "none"}
                      onValueChange={(v) => patch(i, { barberId: v === "none" ? null : v })}
                      options={barberOptions}
                      placeholder="Profissional"
                      searchable
                      searchPlaceholder="Buscar profissional"
                      className={cn(
                        "h-8 min-w-0 flex-1 border-transparent bg-transparent px-2 text-xs shadow-none hover:border-gold/25",
                        l.kind === "servico" && !l.barberId && "border-amber-300/60 bg-amber-300/10 hover:border-amber-300/80",
                      )}
                    />
                    <input
                      value={l.unitPriceCents ? centsToInput(l.unitPriceCents) : ""}
                      onChange={(e) => patch(i, { unitPriceCents: moneyToCents(maskMoney(e.target.value)) ?? 0 })}
                      inputMode="decimal"
                      placeholder="0,00"
                      disabled={isCovered(l)}
                      title={isCovered(l) ? "Valor do pacote (já pago, só para comissão)" : undefined}
                      aria-label={`Preço de ${l.name || "item"}`}
                      className={cn(field, "h-8 w-[6.25rem] shrink-0 border-transparent bg-black/20 px-2 text-right text-sm tabular-nums", isCovered(l) && "opacity-60")}
                    />
                    <span className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-transparent bg-black/20 px-0.5">
                      <button
                        type="button"
                        className="flex size-6 cursor-pointer items-center justify-center rounded-md text-cream hover:bg-gold/10 hover:text-gold"
                        onClick={() => patch(i, { quantity: Math.max(1, l.quantity - 1) })}
                        aria-label="Diminuir quantidade"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs tabular-nums text-cream">{l.quantity}</span>
                      <button
                        type="button"
                        className="flex size-6 cursor-pointer items-center justify-center rounded-md text-cream hover:bg-gold/10 hover:text-gold"
                        onClick={() => patch(i, { quantity: Math.min(maxQtyFor(l), l.quantity + 1) })}
                        aria-label="Aumentar quantidade"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))}
            </ul>
          </div>
        )}

        <label className={cn("flex shrink-0 items-center gap-2 text-xs text-muted-foreground", !page && "mt-auto")}>
          <span className="label-caps shrink-0 text-[0.6rem]">Observação</span>
          <textarea
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={1}
            placeholder="Opcional"
            className="field-luxe h-9 min-w-0 flex-1 resize-none overflow-hidden rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-cream [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          />
        </label>
        </div>
      </div>

      <aside
        className={
          page
            ? "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]"
            : "flex min-h-0 flex-col overflow-hidden border-t border-gold/25 bg-[#12110e] md:border-t-0 md:border-l"
        }
      >
        <div className={page ? "scroll-luxe flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5" : "scroll-luxe flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"}>
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

        <section className="rounded-xl border border-border bg-gradient-to-b from-[#262626]/80 to-[#141414] px-3 py-2 shadow-[inset_0_1px_0_rgb(242_237_228/0.05)]">
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="label-caps text-[0.62rem]">Subtotal</span>
            <span className="text-sm tabular-nums text-cream">{formatBRL(totals.subtotal)}</span>
          </div>
          {coveredCents > 0 ? (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <span className="label-caps flex items-center gap-1.5 text-[0.62rem]">
                <Layers className="size-3.5 text-gold/80" aria-hidden="true" />
                Pelo pacote (já pago)
              </span>
              <span className="text-sm tabular-nums text-gold/90">{formatBRL(coveredCents)}</span>
            </div>
          ) : null}
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
                  onBlur={() => {
                    if (discountOverLimit) setDiscount(centsToInput(Math.max(0, subtotalCents)));
                  }}
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
          {discountOverLimit ? (
            <p className="-mt-1 pb-1 text-right text-[0.65rem] tabular-nums text-amber-200">
              Desconto limitado ao subtotal (− {formatBRL(Math.max(0, subtotalCents))})
            </p>
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

          <div className="mt-1 flex items-end justify-between border-t border-gold/25 pt-2">
            <span className="label-caps text-[0.65rem] text-gold">Total</span>
            <span className="font-heading text-[1.65rem] leading-none text-gold tabular-nums">{formatBRL(totals.total)}</span>
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
                      aria-pressed={p.method === m.value}
                      onClick={() =>
                        setPays((cur) =>
                          cur.map((x, j) =>
                            j === i ? { ...x, method: m.value, installments: m.value === "credito" ? x.installments || 1 : 1 } : x,
                          ),
                        )
                      }
                      className={cn(
                        "h-9 cursor-pointer border-r border-border text-xs last:border-r-0",
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
                    className={cn(field, "h-9 w-36 text-right text-base tabular-nums")}
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
                  setPays((cur) => [...cur, { method: "", amount: missing ? centsToInput(missing) : "", installments: 1 }]);
                }}
                className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gold/40 text-xs text-gold hover:border-gold hover:bg-gold/10"
              >
                <Plus className="size-3.5" />
                Dividir em outra forma
              </button>
            ) : null}
            {rest > 0 ? (
              <p className="text-xs text-amber-200">Falta {formatBRL(rest)} para fechar.</p>
            ) : exceedsNonCash ? (
              <p className="text-xs text-amber-200">
                Excede o total em {formatBRL(paidNonCash - totals.total)} — troco só é possível em dinheiro.
              </p>
            ) : troco > 0 ? (
              <p className="text-xs font-medium text-emerald-300">Troco de {formatBRL(troco)} em dinheiro.</p>
            ) : null}
            {payAlert && missingMethod ? (
              <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
                Escolha a forma de pagamento (Dinheiro, Pix, Débito ou Crédito) para fechar a comanda.
              </p>
            ) : null}
          </section>
        ) : dayMismatch ? (
          <div
            role="alert"
            className="flex flex-col gap-2.5 rounded-xl border border-amber-300/50 bg-amber-300/10 px-4 py-4"
          >
            <p className="flex items-center gap-2 font-heading text-base font-semibold uppercase tracking-wide text-amber-200">
              <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
              {registerDay! < ticketDay
                ? `O caixa de ${dayLabel(registerDay!)} ainda está aberto`
                : `Esta comanda é de ${dayLabel(ticketDay)}`}
            </p>
            <p className="text-sm leading-relaxed text-amber-100/90">
              {registerDay! < ticketDay ? (
                <>
                  Esta comanda é de <strong className="font-medium text-amber-50">{dayLabel(ticketDay)}</strong> e só
                  pode ser recebida no caixa desse dia. Feche o caixa de {dayLabel(registerDay!)} e abra o caixa de{" "}
                  {dayLabel(ticketDay)} para receber. Salvar as alterações continua liberado.
                </>
              ) : (
                <>
                  O caixa aberto é de <strong className="font-medium text-amber-50">{dayLabel(registerDay!)}</strong>,
                  mas esta comanda é de {dayLabel(ticketDay)}. Feche o caixa atual e reabra o caixa de{" "}
                  {dayLabel(ticketDay)} pelo histórico para receber. Salvar as alterações continua liberado.
                </>
              )}
            </p>
            <Link
              href={`/u/${slug}/caixa`}
              className={buttonVariants({ variant: "luxe", size: "sm", className: "self-start" })}
            >
              Ir para o Caixa
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-100">
            Abra o caixa do dia para receber. A comanda pode ser salva antes.
          </p>
        )}

        </div>
        <div
          className={
            page
              ? "flex flex-col gap-2 border-t border-gold/20 bg-black/20 px-5 py-3"
              : "flex shrink-0 flex-col gap-2 border-t border-gold/20 bg-[#12110e] px-4 py-3"
          }
        >
          {confirmFree ? (
            <div className="flex flex-col gap-2" role="alertdialog" aria-label="Confirmar comanda de graça">
              <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
                Esta comanda vai sair de graça: o desconto de {formatBRL(totals.discount)} cobre todo o subtotal.
              </p>
              <Button type="submit" variant="luxe" className="w-full" disabled={pending || coveredMissingBarber.length > 0}>
                Confirmar e receber
              </Button>
              <Button type="button" variant="outline" className="h-9 w-full" disabled={pending} onClick={() => setConfirmFree(false)}>
                Voltar
              </Button>
            </div>
          ) : (
            <>
              <Button
                type="submit"
                variant="luxe"
                className="w-full"
                disabled={pending || !registerOpen || dayMismatch || !linesReady || rest > 0 || exceedsNonCash || coveredMissingBarber.length > 0}
                onClick={(e) => {
                  if (missingMethod) {
                    e.preventDefault();
                    setPayAlert(true);
                    return;
                  }
                  if (freeByDiscount) {
                    e.preventDefault();
                    setConfirmFree(true);
                  }
                }}
              >
                Receber {formatBRL(totals.total)}
                <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
              </Button>
              <Button type="submit" formAction={saveAction} variant="outline" className="h-9 w-full" disabled={pending || !linesReady || coveredMissingBarber.length > 0}>
                Salvar comanda
              </Button>
            </>
          )}
        </div>
      </aside>
    </form>
  );
}

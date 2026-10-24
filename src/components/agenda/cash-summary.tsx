"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Lock, RotateCcw, Search, Wallet, X } from "lucide-react";
import { payMethodLabel, type PayMethod } from "@/lib/caixa/math";
import type { MethodTotals } from "@/lib/caixa/types";
import { formatBRL } from "@/lib/validation/service";
import { cn } from "@/lib/utils";

export type CashSummaryTicket = {
  id: string;
  customerName: string;
  barberName: string | null;
  closedAt: string | null;
  totalCents: number;
  methods: PayMethod[];
};

export type CashSummaryData = {
  /** Dia (yyyy-mm-dd) do caixa aberto; null = nenhum caixa aberto. */
  businessDate: string | null;
  openedByName: string | null;
  methods: MethodTotals;
  tickets: CashSummaryTicket[];
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

const METHOD_ROWS: { key: keyof MethodTotals; label: string }[] = [
  { key: "dinheiro", label: "Dinheiro" },
  { key: "pix", label: "Pix" },
  { key: "debito", label: "Cartão débito" },
  { key: "credito", label: "Cartão crédito" },
];

/**
 * Resumo do caixa na agenda: aba na borda direita abre o painel com saldo do
 * dia, formas de pagamento e comandas fechadas — acesso rápido sem sair da agenda.
 */
export function CashSummary({ slug, unitName, cash }: { slug: string; unitName: string; cash: CashSummaryData }) {
  const [open, setOpen] = useState(false);
  const registerOpen = cash.businessDate !== null;
  const [query, setQuery] = useState("");
  const [refreshing, startRefresh] = useTransition();
  const router = useRouter();

  const total = METHOD_ROWS.reduce((n, m) => n + (cash.methods[m.key] ?? 0), 0);
  const shown = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return cash.tickets;
    return cash.tickets.filter((t) => normalize(`${t.customerName} ${t.barberName ?? ""}`).includes(q));
  }, [cash.tickets, query]);

  const dayLabel = cash.businessDate
    ? dayFmt.format(new Date(`${cash.businessDate}T12:00:00`))
    : dayFmt.format(new Date());

  return (
    <>
      {/* Aba na borda direita */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir resumo do caixa do dia"
        title="Resumo do caixa"
        className="cash-tab-edge group fixed top-1/2 right-0 z-[60] flex -translate-y-1/2 cursor-pointer flex-col items-center gap-2.5 rounded-l-xl border-y border-l border-gold/45 bg-[#0c0c0c]/92 py-3.5 pr-1.5 pl-2 shadow-[-8px_12px_28px_rgb(0_0_0/0.55)] backdrop-blur transition-all duration-200 hover:border-gold hover:bg-[#141310] hover:pl-2.5"
      >
        <Wallet className="size-4 shrink-0 text-gold" strokeWidth={2} aria-hidden="true" />
        <span className="label-caps text-[0.62rem] text-cream/90 [writing-mode:vertical-rl]">Caixa</span>
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            registerOpen
              ? "bg-[radial-gradient(circle_at_35%_30%,#e6c65c,#b8912c_70%)] shadow-[0_0_5px_rgb(184_145_44/0.55)] ring-1 ring-[#8a6d1f]/60"
              : "bg-zinc-600",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Fechar resumo do caixa"
            className="fixed inset-0 z-[68] cursor-default bg-black/55"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-label="Resumo do caixa do dia"
            className="fixed inset-y-0 right-0 z-[69] flex w-[24rem] max-w-[92vw] flex-col border-l border-gold/30 bg-[#101010] shadow-[-24px_0_60px_rgb(0_0_0/0.6)]"
          >
            <header className="border-b border-border px-5 pt-5 pb-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-heading text-xl font-semibold tracking-wide text-cream">
                    Caixa do dia
                    <span className={cn("inline-flex items-center gap-1.5 text-[0.7rem] font-medium tracking-normal", registerOpen ? "text-gold" : "text-muted-foreground")}>
                      <span className={cn("size-1.5 rounded-full", registerOpen ? "bg-gold" : "bg-zinc-500")} aria-hidden="true" />
                      {registerOpen ? "Aberto" : "Fechado"}
                    </span>
                  </h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {dayLabel} · {unitName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startRefresh(() => router.refresh())}
                  aria-label="Atualizar resumo do caixa"
                  title="Atualizar"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
                >
                  <RotateCcw className={cn("size-4", refreshing && "animate-spin")} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar painel"
                  className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>

              {registerOpen ? (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground">Saldo do dia</p>
                  <p className="mt-0.5 font-heading text-[2rem] leading-none font-semibold tabular-nums text-cream">
                    {formatBRL(total)}
                  </p>
                  <ul className="mt-4 flex flex-col divide-y divide-border/60">
                    {METHOD_ROWS.map((m) => (
                      <li key={m.key} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="tabular-nums text-cream">{formatBRL(cash.methods[m.key] ?? 0)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-cream">
                  Nenhum caixa aberto. Abra o caixa para começar a receber as comandas.
                </p>
              )}
            </header>

            {registerOpen ? (
              <>
                <div className="flex items-center justify-between gap-3 px-5 pt-4">
                  <h3 className="font-heading text-sm font-semibold tracking-wide text-cream uppercase">Comandas fechadas</h3>
                  <span className="text-sm tabular-nums text-muted-foreground">{cash.tickets.length}</span>
                </div>
                <div className="group relative px-5 pt-3">
                  <span className="pointer-events-none absolute inset-y-0 left-5 flex w-10 items-center justify-center text-muted-foreground transition-colors group-focus-within:text-gold">
                    <Search className="size-4" aria-hidden="true" />
                  </span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar cliente ou barbeiro…"
                    aria-label="Buscar nas comandas fechadas"
                    autoComplete="off"
                    className="field-luxe h-10 w-full min-w-0 rounded-lg border border-input pr-3 pl-10 text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-4">
                  {shown.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {cash.tickets.length === 0 ? "Nenhuma comanda fechada neste caixa ainda." : "Nada encontrado nesta busca."}
                    </p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-border/60">
                      {shown.map((t) => (
                        <li key={t.id}>
                          <Link
                            href={`/u/${slug}/caixa/comanda/${t.id}`}
                            className="group flex items-center gap-3 py-3"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-cream transition-colors group-hover:text-gold">
                                {t.customerName}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {t.barberName ?? "Sem profissional"}
                                {t.closedAt ? ` · ${timeFmt.format(new Date(t.closedAt))}` : ""}
                                {t.methods.length ? ` · ${t.methods.map((m) => payMethodLabel(m)).join(" + ")}` : ""}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-medium tabular-nums text-cream">{formatBRL(t.totalCents)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1" />
            )}

            <footer className="flex flex-col gap-2 border-t border-border px-5 py-4">
              {registerOpen ? (
                <Link
                  href={`/u/${slug}/caixa#fechar-caixa`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gold/50 font-label text-[0.72rem] tracking-[0.16em] text-gold uppercase transition-colors hover:bg-gold/10"
                >
                  <Lock className="size-4" aria-hidden="true" />
                  Encerrar caixa
                </Link>
              ) : (
                <Link
                  href={`/u/${slug}/caixa`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gold font-label text-[0.72rem] font-medium tracking-[0.16em] text-[#1a1408] uppercase transition-opacity hover:opacity-90"
                >
                  Abrir caixa
                </Link>
              )}
              <Link
                href={`/u/${slug}/caixa`}
                className="link-luxe label-caps inline-flex items-center justify-center gap-2 py-1 text-[0.65rem]"
              >
                Ver métricas do dia
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </footer>
          </aside>
        </>
      ) : null}
    </>
  );
}

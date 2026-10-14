import { Building2, CalendarClock, Receipt, ReceiptText, TrendingUp, Wallet } from "lucide-react";
import { LuxeFrame } from "@/components/ui/luxe-frame";
import type { CustomerHistoryEntry } from "@/lib/customers/types";
import { formatBRL } from "@/lib/validation/service";
import { cn } from "@/lib/utils";
import { FormSection } from "./form-parts";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const dateOnly = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

const STATUS: Record<CustomerHistoryEntry["status"], { label: string; className: string }> = {
  aberta: { label: "Aberta", className: "border-gold/40 bg-gold/10 text-gold" },
  fechada: { label: "Fechada", className: "border-success/40 bg-success/10 text-success" },
  cancelada: { label: "Cancelada", className: "border-border text-muted-foreground" },
};

/** Resumo do cliente a partir das comandas FECHADAS (abertas e canceladas não entram nos totais). */
export function summarize(entries: CustomerHistoryEntry[]) {
  const closed = entries.filter((e) => e.status === "fechada");
  const total = closed.reduce((sum, e) => sum + e.totalCents, 0);
  const last = closed.reduce<string | null>((acc, e) => (acc === null || e.openedAt > acc ? e.openedAt : acc), null);
  return {
    visits: closed.length,
    totalCents: total,
    averageCents: closed.length ? Math.round(total / closed.length) : 0,
    lastVisit: last,
  };
}

function Stat({ icon: Icon, label, value }: { icon: typeof Receipt; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-black/20 p-4">
      <span className="flex items-center gap-2 label-caps text-[0.65rem]">
        <Icon className="size-3.5 text-gold" aria-hidden="true" />
        {label}
      </span>
      <span className="font-heading text-xl font-semibold tracking-wide">{value}</span>
    </div>
  );
}

/**
 * Aba "Histórico": resumo e lista de comandas do cliente em TODAS as unidades da rede;
 * cada comanda mostra a unidade onde aconteceu. As comandas ainda não existem: com a lista
 * vazia aparece o estado "Nenhuma comanda ainda" e, quando o módulo chegar, basta alimentar `entries`.
 */
export function CustomerHistory({ entries }: { entries: CustomerHistoryEntry[] }) {
  const s = summarize(entries);

  return (
    <>
      <FormSection icon={TrendingUp} title="Resumo" description="Considera as comandas fechadas, em todas as unidades.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat icon={Receipt} label="Visitas" value={String(s.visits)} />
          <Stat icon={Wallet} label="Total gasto" value={formatBRL(s.totalCents)} />
          <Stat icon={ReceiptText} label="Ticket médio" value={formatBRL(s.averageCents)} />
          <Stat icon={CalendarClock} label="Última visita" value={s.lastVisit ? dateOnly.format(new Date(s.lastVisit)) : "—"} />
        </div>
      </FormSection>

      <FormSection icon={ReceiptText} title="Comandas" description="Do atendimento mais recente para o mais antigo.">
        {entries.length === 0 ? (
          <LuxeFrame contentClassName="flex flex-col items-center px-6 py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-full border border-gold/40 bg-[#101010] text-gold">
              <ReceiptText className="size-6" aria-hidden="true" />
            </span>
            <p className="mt-5 font-heading text-lg uppercase tracking-wide">Nenhuma comanda ainda</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Quando este cliente for atendido, as comandas aparecem aqui com a unidade, o profissional, os itens e o valor.
            </p>
          </LuxeFrame>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 py-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-heading text-base uppercase tracking-wide">{dateTime.format(new Date(e.openedAt))}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Building2 className="size-3.5 shrink-0 text-gold/80" aria-hidden="true" />
                    {e.unitName}
                    {e.barberName ? ` · ${e.barberName}` : ""}
                  </p>
                  {e.items.length ? <p className="text-sm text-muted-foreground">{e.items.join(", ")}</p> : null}
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 font-label text-[0.65rem] uppercase tracking-[0.18em]",
                      STATUS[e.status].className,
                    )}
                  >
                    {STATUS[e.status].label}
                  </span>
                  <span className="font-heading text-base font-semibold tracking-wide">{formatBRL(e.totalCents)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </>
  );
}

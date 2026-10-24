import type { Metadata } from "next";
import Link from "next/link";
import { UserRoundPlus } from "lucide-react";
import { AgendaBoard } from "@/components/agenda/agenda-board";
import type { CashSummaryData } from "@/components/agenda/cash-summary";
import { EmptyState } from "@/components/unit/empty-state";
import { PageHeader } from "@/components/unit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getAgendaCatalog, listAgendaBarbers, listAgendaEntries } from "@/lib/agenda/queries";
import { gridRange, isIsoDate, todayIso } from "@/lib/agenda/time";
import { requireUnitArea } from "@/lib/auth/guards";
import { getOpenRegister, listRegisterPayments, listRegisterTickets } from "@/lib/caixa/queries";
import type { MethodTotals } from "@/lib/caixa/types";
import { getUnitSettings } from "@/lib/units/queries";

export const metadata: Metadata = { title: "Agenda" };
export const instant = false;

export default async function AgendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ data?: string }>;
}) {
  const { slug } = await params;
  const { data } = await searchParams;
  const { unit } = await requireUnitArea(slug, "agenda"); // cada página valida o acesso: o layout não re-executa na navegação

  const today = todayIso();
  const date = typeof data === "string" && isIsoDate(data) ? data : today;

  const [settings, entries, catalog, register] = await Promise.all([
    getUnitSettings(unit.id),
    listAgendaEntries(unit.id, date),
    getAgendaCatalog(unit.id),
    getOpenRegister(unit.id),
  ]);
  const barbers = await listAgendaBarbers(unit.id, new Set(entries.map((e) => e.barberId)));
  const slot = settings?.slot_minutes ?? 30;

  // Resumo do caixa para o painel lateral da agenda (só o caixa aberto, leitura enxuta).
  const emptyMethods: MethodTotals = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
  const [registerMethods, registerTickets] = register
    ? await Promise.all([listRegisterPayments(register.id), listRegisterTickets(register.id)])
    : [emptyMethods, []];
  const cashSummary: CashSummaryData = {
    businessDate: register?.businessDate ?? null,
    openedByName: register?.openedByName ?? null,
    methods: registerMethods,
    tickets: registerTickets.map((t) => ({
      id: t.id,
      customerName: t.customerName,
      barberName: t.barberName,
      closedAt: t.closedAt,
      totalCents: t.totalCents,
      methods: [...new Set(t.payments.map((p) => p.method))],
    })),
  };

  const header = (
    <PageHeader eyebrow="Recepção" title="Agenda" />
  );

  if (barbers.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <EmptyState
          icon={UserRoundPlus}
          title="Cadastre um profissional"
          description="A agenda tem uma coluna para cada profissional ativo da unidade. Cadastre o primeiro para começar a marcar horários."
          action={
            <Link href={`/u/${slug}/profissionais/novo`} className={buttonVariants({ variant: "luxe", size: "lg" })}>
              Novo profissional
            </Link>
          }
        />
      </div>
    );
  }

  const { from, to } = gridRange({
    unitHours: settings?.opening_hours,
    barbersHours: barbers.map((b) => b.workHours),
    date,
    extra: entries.map((e) => ({ start: e.startMin, end: e.endMin })),
  });

  return (
    <div className="flex flex-col gap-6">
      {header}
      <AgendaBoard
        slug={slug}
        date={date}
        today={today}
        slot={slot}
        unitHours={settings?.opening_hours ?? null}
        barbers={barbers}
        entries={entries}
        services={catalog.services}
        offers={catalog.offers}
        popularIds={catalog.popularIds}
        from={from}
        to={to}
        cashSummary={cashSummary}
        unitName={unit.name}
      />
    </div>
  );
}

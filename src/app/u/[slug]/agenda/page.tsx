import type { Metadata } from "next";
import Link from "next/link";
import { UserRoundPlus } from "lucide-react";
import { AgendaBoard } from "@/components/agenda/agenda-board";
import { PageHeader } from "@/components/unit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LuxeFrame } from "@/components/ui/luxe-frame";
import { getAgendaCatalog, listAgendaBarbers, listAgendaEntries } from "@/lib/agenda/queries";
import { gridRange, isIsoDate, todayIso } from "@/lib/agenda/time";
import { requireUnitArea } from "@/lib/auth/guards";
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

  const [settings, entries, catalog] = await Promise.all([
    getUnitSettings(unit.id),
    listAgendaEntries(unit.id, date),
    getAgendaCatalog(unit.id),
  ]);
  const barbers = await listAgendaBarbers(unit.id, new Set(entries.map((e) => e.barberId)));
  const slot = settings?.slot_minutes ?? 30;

  const header = (
    <PageHeader eyebrow="Recepção" title="Agenda" />
  );

  if (barbers.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        <LuxeFrame
          className="reveal"
          style={{ "--d": "150ms" } as React.CSSProperties}
          contentClassName="flex flex-col items-center px-6 py-12 text-center sm:py-14"
        >
          <span className="relative flex size-16 items-center justify-center rounded-full border border-gold/40 bg-[#101010] text-gold shadow-[0_0_32px_rgb(192_160_98/0.2)]">
            <UserRoundPlus className="size-7" aria-hidden="true" />
          </span>
          <p className="mt-6 font-heading text-xl uppercase tracking-wide">Cadastre um profissional</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            A agenda tem uma coluna para cada profissional ativo da unidade. Cadastre o primeiro para começar a marcar horários.
          </p>
          <Link href={`/u/${slug}/profissionais/novo`} className={buttonVariants({ variant: "luxe", size: "lg", className: "mt-6" })}>
            Novo profissional
          </Link>
        </LuxeFrame>
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
      />
    </div>
  );
}

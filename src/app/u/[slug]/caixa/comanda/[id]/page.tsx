import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, UserRound } from "lucide-react";
import { cancelTicketAction } from "../../actions";
import { TicketEditor } from "@/components/caixa/ticket-editor";
import { PageHeader } from "@/components/unit/page-header";
import { Button } from "@/components/ui/button";
import { requireUnitArea } from "@/lib/auth/guards";
import { getOpenRegister, getTicket, listCatalog } from "@/lib/caixa/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Comanda" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const STATUS = {
  aberta: { label: "Aberta", classes: "border-amber-300/40 bg-amber-300/10 text-amber-200", dot: "bg-amber-300" },
  fechada: { label: "Paga", classes: "border-success/40 bg-success/10 text-emerald-200", dot: "bg-success" },
  cancelada: { label: "Cancelada", classes: "border-border bg-black/30 text-muted-foreground", dot: "bg-muted-foreground" },
} as const;

export default async function ComandaPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const { unit } = await requireUnitArea(slug, "caixa");
  const [ticket, catalog, register] = await Promise.all([
    getTicket(unit.id, id),
    listCatalog(unit.id),
    getOpenRegister(unit.id),
  ]);
  if (!ticket) notFound();

  const status = STATUS[ticket.status];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/u/${slug}/caixa`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
          <ArrowLeft className="size-3.5" />
          Caixa
        </Link>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 font-label text-[0.65rem] uppercase tracking-[0.18em]",
            status.classes,
          )}
        >
          <span className={cn("size-1.5 rounded-full", status.dot)} aria-hidden="true" />
          {status.label}
        </span>
        {ticket.customerId ? (
          <Link
            href={`/u/${slug}/clientes/${ticket.customerId}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
          >
            <UserRound className="size-3.5" />
            Ficha do cliente
          </Link>
        ) : null}
        {ticket.appointmentId ? (
          <Link
            href={`/u/${slug}/agenda`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold"
          >
            <CalendarDays className="size-3.5" />
            Ver na agenda
          </Link>
        ) : null}
      </div>

      <PageHeader
        eyebrow="Comanda"
        title={ticket.customerName}
        description={
          ticket.status === "aberta"
            ? `Aberta às ${timeFmt.format(new Date(ticket.openedAt))} · ${ticket.barberName ?? "sem profissional"}. Lance os itens, confira a cobrança e receba.`
            : ticket.status === "fechada"
              ? "Comanda já recebida. O lançamento fica no histórico do caixa."
              : "Comanda cancelada. Os itens ficam só para consulta."
        }
        action={
          ticket.status === "aberta" ? (
            <form action={cancelTicketAction.bind(null, slug, ticket.id)}>
              <Button type="submit" variant="outline" size="sm" className="hover:border-destructive/60 hover:text-rose-300">
                Cancelar comanda
              </Button>
            </form>
          ) : null
        }
      />

      <TicketEditor
        key={`${ticket.id}-${ticket.status}`}
        variant="page"
        slug={slug}
        ticket={ticket}
        services={catalog.services}
        products={catalog.products}
        barbers={catalog.barbers}
        registerOpen={!!register}
        registerDay={register?.businessDate ?? null}
      />
    </div>
  );
}

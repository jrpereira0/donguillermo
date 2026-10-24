import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, UserRound } from "lucide-react";
import { cancelTicketAction, salePackageOptions, usablePackages } from "../../actions";
import { TicketEditor } from "@/components/caixa/ticket-editor";
import { PageHeader } from "@/components/unit/page-header";
import { ConfirmSubmitForm } from "@/components/ui/confirm-submit-form";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { requireUnitArea } from "@/lib/auth/guards";
import { getOpenRegister, getTicket, listCatalog } from "@/lib/caixa/queries";

export const metadata: Metadata = { title: "Comanda" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  aberta: { label: "Aberta", tone: "gold" },
  fechada: { label: "Paga", tone: "success" },
  cancelada: { label: "Cancelada", tone: "muted" },
};

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
  const [packages, salePackages] = await Promise.all([
    usablePackages(unit.id, ticket),
    salePackageOptions(unit.id),
  ]);

  const status = STATUS[ticket.status];

  return (
    // Altura da tela (descontando o py-10 do <main>): a comanda não rola;
    // só a lista de itens rola, dentro do painel.
    <div className="flex flex-col gap-6 lg:h-[calc(100dvh-5rem)]">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/u/${slug}/caixa`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
          <ArrowLeft className="size-3.5" />
          Caixa
        </Link>
        <StatusPill tone={status.tone} dot className="ml-auto">
          {status.label}
        </StatusPill>
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
            ? `Aberta às ${timeFmt.format(new Date(ticket.openedAt))} · ${ticket.barberName ?? "sem profissional"}.`
            : ticket.status === "fechada"
              ? "Comanda já recebida."
              : "Comanda cancelada."
        }
        action={
          ticket.status === "aberta" ? (
            <ConfirmSubmitForm
              action={cancelTicketAction.bind(null, slug, ticket.id)}
              label="Cancelar comanda"
              title="Cancelar esta comanda?"
              description="Os itens lançados serão descartados e a comanda sai das abertas. Isso não tem volta."
              confirmLabel="Sim, cancelar comanda"
              className="hover:border-destructive/60 hover:text-destructive"
            />
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
        packages={packages}
        salePackages={salePackages}
      />
    </div>
  );
}

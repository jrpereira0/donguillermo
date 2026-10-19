"use client";

import { DialogShell } from "@/components/agenda/dialog-shell";
import type { CatalogBarber, CatalogProduct, CatalogService, TicketDetail } from "@/lib/caixa/types";
import { TicketEditor } from "./ticket-editor";

export function ComandaDialog({
  slug,
  ticket,
  services,
  products,
  barbers,
  registerOpen,
  registerDay,
  onClose,
  onCharged,
  onSaved,
  onReopened,
}: {
  slug: string;
  ticket: TicketDetail;
  services: CatalogService[];
  products: CatalogProduct[];
  barbers: CatalogBarber[];
  registerOpen: boolean;
  registerDay?: string | null;
  onClose: () => void;
  onCharged: (message: string) => void;
  onSaved?: (message: string) => void;
  onReopened?: (message: string) => void;
}) {
  return (
    <DialogShell size="xl" eyebrow="Comanda" title={ticket.customerName} onClose={onClose}>
      <TicketEditor
        key={`${ticket.id}-${ticket.status}`}
        slug={slug}
        ticket={ticket}
        services={services}
        products={products}
        barbers={barbers}
        registerOpen={registerOpen}
        registerDay={registerDay}
        onCharged={onCharged}
        onSaved={onSaved}
        onReopened={onReopened}
      />
    </DialogShell>
  );
}

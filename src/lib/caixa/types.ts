import type { PayMethod } from "./math";

export type CashTicketRow = {
  id: string;
  customerName: string;
  barberName: string | null;
  status: "aberta" | "fechada" | "cancelada";
  openedAt: string;
  closedAt: string | null;
  totalCents: number;
  discountCents: number;
  tipCents: number;
  items: string[];
  payments: { method: PayMethod; amountCents: number; installments: number }[];
};

export type CashMovement = {
  id: string;
  kind: "sangria" | "suprimento";
  amountCents: number;
  note: string | null;
  createdAt: string;
  authorName: string | null;
};

export type MethodTotals = Record<PayMethod, number>;

export type RegisterEvent = {
  id: string;
  kind: "abertura" | "fechamento" | "reabertura";
  actorName: string | null;
  openingCents: number | null;
  countedCents: number | null;
  expectedCents: number | null;
  createdAt: string;
};

export type OpenRegister = {
  id: string;
  businessDate: string;
  openingCents: number;
  openedAt: string;
  openedByName: string | null;
  notes: string | null;
};

export type ClosedRegister = OpenRegister & {
  closedAt: string;
  closedByName: string | null;
  expectedCashCents: number;
  countedCashCents: number;
  ticketCount: number;
  totalCents: number;
};

export type TicketLine = {
  kind: "servico" | "produto" | "pacote";
  serviceId: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  barberId: string | null;
  /** Pacote do cliente: venda (kind "pacote") ou uso de serviço (servico + este campo). */
  customerPackageId: string | null;
  packageId: string | null;
  packageName: string | null;
};

/** Pacote ativo do cliente da comanda, com saldo por serviço (sem contar esta comanda). */
export type TicketPackageOption = {
  customerPackageId: string;
  packageName: string;
  /** Preço pago no pacote e total de serviços, para a cota de faturamento. */
  priceCents: number;
  totalServices: number;
  items: { serviceId: string; serviceName: string; quantityTotal: number; remaining: number; unitPriceCents: number }[];
};

/** Pacote do catálogo que pode ser vendido nesta comanda. */
export type TicketPackageSaleOption = {
  packageId: string;
  name: string;
  priceCents: number;
  listCents: number;
  discountPct: number;
  totalServices: number;
  items: { serviceId: string; serviceName: string; quantity: number; unitPriceCents: number }[];
};

export type TicketDetail = {
  id: string;
  status: "aberta" | "fechada" | "cancelada";
  customerId: string | null;
  customerName: string;
  barberId: string | null;
  barberName: string | null;
  discountCents: number;
  tipCents: number;
  notes: string | null;
  openedAt: string;
  closedAt: string | null;
  appointmentId: string | null;
  lines: TicketLine[];
  tips: { barberId: string; barberName: string | null; amountCents: number }[];
  payments: { method: PayMethod; amountCents: number; installments: number }[];
};

export type CatalogService = { id: string; name: string; priceCents: number };
export type CatalogProduct = { id: string; name: string; priceCents: number };
export type CatalogBarber = { id: string; name: string };

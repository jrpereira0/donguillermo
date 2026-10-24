import type { FormState } from "@/lib/validation/auth";

export type PackageFormState = FormState & { values?: Record<string, string> };
export const initialPackageState: PackageFormState = { status: "idle" };

/** Item do catálogo: serviço + quantas vezes entra no pacote. */
export type PackageItem = {
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPriceCents: number;
};

export type PackageTemplate = {
  id: string;
  name: string;
  description: string | null;
  /** Como o preço foi definido no cadastro: % de desconto ou valor fixo. */
  priceMode: "desconto" | "fixo";
  /** Valor fixo definido (só no modo 'fixo'). */
  fixedPriceCents: number | null;
  /** Desconto efetivo (%): no modo fixo, o implícito sobre a soma. */
  discountPct: number;
  validityDays: number | null;
  isActive: boolean;
  items: PackageItem[];
  /** Soma dos serviços (preço cheio). */
  listCents: number;
  /** Preço de venda: lista com o desconto do pacote. */
  priceCents: number;
  /** Clientes com este pacote (qualquer situação, nesta unidade). */
  buyersCount: number;
};

export type CustomerPackageItemBalance = {
  serviceId: string | null;
  serviceName: string;
  quantityTotal: number;
  used: number;
  unitPriceCents: number;
};

/** Saldo utilizável de um pacote (agenda/comanda): só serviços com saldo. */
export type UsableCustomerPackage = {
  id: string;
  name: string;
  items: { serviceId: string; serviceName: string; quantityTotal: number; remaining: number }[];
};

export type CustomerPackageStatus = "pendente" | "ativa" | "esgotada" | "expirada" | "cancelada";

export type CustomerPackage = {
  id: string;
  packageId: string | null;
  packageName: string;
  discountPct: number;
  listCents: number;
  priceCents: number;
  status: CustomerPackageStatus;
  soldAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  soldTicketId: string | null;
  items: CustomerPackageItemBalance[];
  totalServices: number;
  usedServices: number;
  remainingServices: number;
};

export type PackageUseEntry = {
  ticketId: string;
  ticketStatus: "aberta" | "fechada" | "cancelada";
  serviceName: string;
  quantity: number;
  barberName: string | null;
  packageName: string;
  whenAt: string;
};

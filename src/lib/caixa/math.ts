export const PAY_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
] as const;

export type PayMethod = (typeof PAY_METHODS)[number]["value"];

export const payMethodLabel = (v: string) => PAY_METHODS.find((m) => m.value === v)?.label ?? v;

export function ticketTotals(
  lines: { quantity: number; unitPriceCents: number; packageCovered?: boolean }[],
  discountCents: number,
  tipCents = 0,
) {
  // Serviço "pelo pacote" já foi pago na venda do pacote: não entra no cobrável,
  // mas o valor cheio fica registrado (produção/comissão do barbeiro).
  const coveredCents = lines.reduce((n, l) => n + (l.packageCovered ? l.quantity * l.unitPriceCents : 0), 0);
  const subtotal = lines.reduce((n, l) => n + (l.packageCovered ? 0 : l.quantity * l.unitPriceCents), 0);
  const discount = Math.min(Math.max(0, discountCents), Math.max(0, subtotal));
  const tip = Math.max(0, tipCents);
  return { subtotal, coveredCents, discount, tip, total: subtotal - discount + tip };
}

/** Dinheiro que deve estar na gaveta: fundo + suprimento − sangria + vendas em dinheiro. */
export function expectedCash(opts: {
  openingCents: number;
  suprimentoCents: number;
  sangriaCents: number;
  dinheiroCents: number;
}) {
  return opts.openingCents + opts.suprimentoCents - opts.sangriaCents + opts.dinheiroCents;
}

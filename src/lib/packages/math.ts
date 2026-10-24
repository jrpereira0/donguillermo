export type PackagePriceMode = "desconto" | "fixo";

/** Preço de venda do pacote: valor cheio dos serviços com o desconto (%) do pacote. */
export function packagePriceCents(listCents: number, discountPct: number): number {
  const pct = Math.min(90, Math.max(0, discountPct));
  return Math.round((listCents * (100 - pct)) / 100);
}

/**
 * Preço de venda do pacote nas duas formas: 'desconto' aplica o % sobre a
 * soma dos serviços; 'fixo' é o valor fechado definido no cadastro.
 */
export function packagePriceFor(
  listCents: number,
  mode: PackagePriceMode,
  discountPct: number,
  fixedPriceCents: number | null,
): number {
  if (mode === "fixo") return Math.max(0, Math.round(fixedPriceCents ?? 0));
  return packagePriceCents(listCents, discountPct);
}

/**
 * Valor de cada serviço no faturamento do profissional: o preço pago no pacote
 * dividido pela quantidade de serviços dele. A venda do pacote não gera
 * comissão; cada uso entra com esta cota.
 */
export function packageServiceShareCents(priceCents: number, serviceCount: number): number {
  if (serviceCount <= 0 || priceCents <= 0) return 0;
  return Math.round(priceCents / serviceCount);
}

/** Desconto efetivo (%) de um preço sobre a soma: no modo fixo, é o implícito. */
export function packageEffectiveDiscountPct(listCents: number, priceCents: number): number {
  if (listCents <= 0 || priceCents >= listCents) return 0;
  return Math.round((1 - priceCents / listCents) * 10_000) / 100;
}

/** "20" / "20,5" (pt-BR) → número; NaN quando inválido. */
export function parsePercentBR(raw: string): number {
  const s = String(raw).trim();
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : NaN;
}

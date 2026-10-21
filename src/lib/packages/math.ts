/** Preço de venda do pacote: valor cheio dos serviços com o desconto (%) do pacote. */
export function packagePriceCents(listCents: number, discountPct: number): number {
  const pct = Math.min(90, Math.max(0, discountPct));
  return Math.round((listCents * (100 - pct)) / 100);
}

/** "20" / "20,5" (pt-BR) → número; NaN quando inválido. */
export function parsePercentBR(raw: string): number {
  const s = String(raw).trim();
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : NaN;
}

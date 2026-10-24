/**
 * Comissões definidas pelo admin da rede, com exceção por profissional:
 * - SERVIÇOS: tabela progressiva (o percentual é o da faixa em que cai o
 *   faturamento de serviços do barbeiro no mês, aplicado sobre TODO o
 *   faturamento daquele mês — faixa única, não é por fatias).
 * - PRODUTOS: percentual único da rede (`commission_settings`).
 * - POR PROFISSIONAL: se ele tiver % próprio (serviços e/ou produtos),
 *   vale o dele, fora da regra da rede; sem % próprio, segue a rede.
 *
 * A tabela vigente mora no banco (`commission_brackets`, editável pelo admin
 * da rede); os valores abaixo são a tabela de 2026 do contrato — servem de
 * referência/teste e de ponto de partida do editor.
 */
export type CommissionBracket = {
  /** Início da faixa, em centavos (inclusive). */
  minCents: number;
  /** Fim da faixa, em centavos (inclusive); `null` = sem teto. */
  maxCents: number | null;
  pct: number;
};

export const DEFAULT_BRACKETS_2026: CommissionBracket[] = [
  { minCents: 100, maxCents: 1_073_873, pct: 25 },
  { minCents: 1_073_874, maxCents: 1_208_107, pct: 26 },
  { minCents: 1_208_108, maxCents: 1_342_341, pct: 27 },
  { minCents: 1_342_342, maxCents: 1_476_575, pct: 28 },
  { minCents: 1_476_576, maxCents: 1_610_809, pct: 29 },
  { minCents: 1_610_810, maxCents: 1_879_279, pct: 30 },
  { minCents: 1_879_280, maxCents: 2_147_746, pct: 31 },
  { minCents: 2_147_747, maxCents: 2_416_215, pct: 32 },
  { minCents: 2_416_216, maxCents: 2_684_682, pct: 33 },
  { minCents: 2_684_683, maxCents: 2_953_050, pct: 33.5 },
  { minCents: 2_953_051, maxCents: 3_221_418, pct: 34 },
  { minCents: 3_221_419, maxCents: 3_489_786, pct: 34.5 },
  { minCents: 3_489_787, maxCents: null, pct: 35 },
];

const sorted = (brackets: CommissionBracket[]) => [...brackets].sort((a, b) => a.minCents - b.minCents);

/** Faixa de um faturamento de serviços (centavos). Sem faixa aplicável, usa a mais próxima. */
export function bracketFor(brackets: CommissionBracket[], servicesCents: number): CommissionBracket | null {
  const list = sorted(brackets);
  if (!list.length) return null;
  const cents = Math.max(0, Math.floor(servicesCents));
  const hit = list.find((b) => cents >= b.minCents && (b.maxCents === null || cents <= b.maxCents));
  if (hit) return hit;
  if (cents < list[0].minCents) return list[0];
  // Buraco entre faixas ou acima do teto: vale a maior faixa já alcançada.
  const below = list.filter((b) => b.minCents <= cents);
  return below[below.length - 1] ?? list[list.length - 1];
}

/** Percentual de serviços para o faturamento do mês; sem tabela, cai no % fixo legado do cadastro. */
export function servicesPctFor(brackets: CommissionBracket[], servicesCents: number, fallbackPct: number): number {
  return bracketFor(brackets, servicesCents)?.pct ?? fallbackPct;
}

/** Comissão de serviços do mês (centavos), arredondada como o restante do caixa. */
export function servicesCommissionCents(
  brackets: CommissionBracket[],
  servicesCents: number,
  fallbackPct: number,
): number {
  return Math.round((servicesCents * servicesPctFor(brackets, servicesCents, fallbackPct)) / 100);
}

const pctOfCents = (cents: number, pct: number) => Math.round((cents * pct) / 100);

/**
 * Comissão de serviços do mês de UM profissional: com % próprio, vale ele
 * (fixo, fora da tabela); sem % próprio, vale a tabela progressiva da rede
 * (sem tabela cadastrada, 0 — quem define é o admin).
 */
export function barberServicesCommissionCents(
  brackets: CommissionBracket[],
  servicesCents: number,
  ownPct: number | null,
): number {
  if (ownPct !== null) return pctOfCents(servicesCents, ownPct);
  return servicesCommissionCents(brackets, servicesCents, 0);
}

/** % de serviços vigente de um profissional para o faturamento do mês (exibição). */
export function barberServicesPctFor(
  brackets: CommissionBracket[],
  servicesCents: number,
  ownPct: number | null,
): number {
  if (ownPct !== null) return ownPct;
  return servicesPctFor(brackets, servicesCents, 0);
}

/** % de produtos de um profissional: o % próprio quando definido; senão, o da rede. */
export function barberProductsPctFor(ownPct: number | null, networkPct: number): number {
  return ownPct ?? networkPct;
}

/**
 * Valida a tabela editada pelo admin: faixas em ordem, sem buraco nem
 * sobreposição (cada "De" é o "Até" anterior + R$ 0,01), % entre 0 e 100 e
 * "sem teto" só na última. Retorna a mensagem de erro ou `null` se está ok.
 */
export function validateBrackets(brackets: CommissionBracket[]): string | null {
  if (!brackets.length) return "A tabela precisa de pelo menos uma faixa.";
  for (const [i, b] of brackets.entries()) {
    if (!Number.isInteger(b.minCents) || b.minCents < 0) return `Faixa ${i + 1}: valor "De" inválido.`;
    if (b.maxCents !== null && (!Number.isInteger(b.maxCents) || b.maxCents < b.minCents))
      return `Faixa ${i + 1}: o "Até" precisa ser maior ou igual ao "De".`;
    if (b.maxCents === null && i < brackets.length - 1)
      return `Faixa ${i + 1}: só a última faixa pode ficar sem teto.`;
    if (!Number.isFinite(b.pct) || b.pct < 0 || b.pct > 100) return `Faixa ${i + 1}: percentual entre 0 e 100.`;
    if (i > 0) {
      const prev = brackets[i - 1];
      if (prev.maxCents === null || b.minCents !== prev.maxCents + 1)
        return `Faixa ${i + 1}: o "De" precisa ser o "Até" da faixa anterior + R$ 0,01 (sem buraco nem sobreposição).`;
    }
  }
  return null;
}

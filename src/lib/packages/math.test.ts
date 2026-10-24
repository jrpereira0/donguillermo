import { describe, expect, it } from "vitest";
import { packageEffectiveDiscountPct, packagePriceCents, packagePriceFor, packageServiceShareCents } from "./math";

describe("preço do pacote", () => {
  it("desconto: aplica o % sobre a soma dos serviços", () => {
    expect(packagePriceCents(36_000, 10)).toBe(32_400);
    expect(packagePriceFor(36_000, "desconto", 10, null)).toBe(32_400);
  });

  it("fixo: vale o valor fechado, independente da soma e do %", () => {
    expect(packagePriceFor(36_000, "fixo", 10, 30_000)).toBe(30_000);
    expect(packagePriceFor(36_000, "fixo", 0, 36_000)).toBe(36_000);
  });

  it("cota do serviço: preço do pacote dividido pela quantidade", () => {
    expect(packageServiceShareCents(28_000, 4)).toBe(7_000);
    expect(packageServiceShareCents(10_001, 3)).toBe(3_334);
    expect(packageServiceShareCents(10_000, 0)).toBe(0);
    expect(packageServiceShareCents(0, 4)).toBe(0);
  });

  it("desconto efetivo: no fixo, é o implícito sobre a soma", () => {
    expect(packageEffectiveDiscountPct(36_000, 32_400)).toBe(10);
    expect(packageEffectiveDiscountPct(36_000, 30_000)).toBe(16.67);
    expect(packageEffectiveDiscountPct(36_000, 36_000)).toBe(0);
    expect(packageEffectiveDiscountPct(0, 0)).toBe(0);
  });
});

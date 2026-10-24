import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRACKETS_2026,
  barberProductsPctFor,
  barberServicesCommissionCents,
  barberServicesPctFor,
  bracketFor,
  servicesCommissionCents,
  servicesPctFor,
} from "./brackets";

describe("tabela progressiva de comissão (2026)", () => {
  it("começa em 25% para faturamento pequeno", () => {
    expect(bracketFor(DEFAULT_BRACKETS_2026, 0)?.pct).toBe(25);
    expect(bracketFor(DEFAULT_BRACKETS_2026, 90_00)?.pct).toBe(25);
    expect(bracketFor(DEFAULT_BRACKETS_2026, 1_073_873)?.pct).toBe(25);
  });

  it("sobe de faixa nos limites exatos da tabela", () => {
    expect(bracketFor(DEFAULT_BRACKETS_2026, 1_073_874)?.pct).toBe(26);
    expect(bracketFor(DEFAULT_BRACKETS_2026, 1_208_107)?.pct).toBe(26);
    expect(bracketFor(DEFAULT_BRACKETS_2026, 1_208_108)?.pct).toBe(27);
    expect(bracketFor(DEFAULT_BRACKETS_2026, 2_684_683)?.pct).toBe(33.5);
    expect(bracketFor(DEFAULT_BRACKETS_2026, 3_489_787)?.pct).toBe(35);
  });

  it("acima da última faixa continua no teto de 35%", () => {
    expect(bracketFor(DEFAULT_BRACKETS_2026, 9_999_999)?.pct).toBe(35);
  });

  it("faixa única: o % vale sobre todo o faturamento do mês", () => {
    // R$ 15.000,00 de serviços → faixa de 29% sobre tudo = R$ 4.350,00
    expect(servicesCommissionCents(DEFAULT_BRACKETS_2026, 1_500_000, 40)).toBe(435_000);
    expect(servicesPctFor(DEFAULT_BRACKETS_2026, 1_500_000, 40)).toBe(29);
  });

  it("sem tabela configurada, usa o % fixo do cadastro (legado)", () => {
    expect(servicesPctFor([], 1_500_000, 40)).toBe(40);
    expect(servicesCommissionCents([], 10_000, 40)).toBe(4_000);
    expect(bracketFor([], 10_000)).toBeNull();
  });
});

describe("comissão por profissional (admin define; % próprio vence a rede)", () => {
  it("serviços: sem % próprio, vale a tabela progressiva da rede", () => {
    expect(barberServicesCommissionCents(DEFAULT_BRACKETS_2026, 1_500_000, null)).toBe(435_000);
    expect(barberServicesPctFor(DEFAULT_BRACKETS_2026, 1_500_000, null)).toBe(29);
  });

  it("serviços: com % próprio, vale ele sobre tudo (fora da tabela)", () => {
    expect(barberServicesCommissionCents(DEFAULT_BRACKETS_2026, 1_500_000, 40)).toBe(600_000);
    expect(barberServicesPctFor(DEFAULT_BRACKETS_2026, 1_500_000, 40)).toBe(40);
  });

  it("serviços: % próprio 0 é regra válida (não cai na tabela)", () => {
    expect(barberServicesCommissionCents(DEFAULT_BRACKETS_2026, 1_500_000, 0)).toBe(0);
  });

  it("serviços: sem tabela e sem % próprio, comissão é 0", () => {
    expect(barberServicesCommissionCents([], 1_500_000, null)).toBe(0);
  });

  it("produtos: % próprio vence o da rede; vazio segue o da rede", () => {
    expect(barberProductsPctFor(15, 10)).toBe(15);
    expect(barberProductsPctFor(null, 10)).toBe(10);
    expect(barberProductsPctFor(0, 10)).toBe(0);
  });
});

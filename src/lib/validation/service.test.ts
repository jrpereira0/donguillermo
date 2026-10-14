import { describe, expect, it } from "vitest";
import {
  DURATIONS,
  SERVICE_CATEGORIES,
  categoryLabel,
  centsToInput,
  formatBRL,
  formatDuration,
  maskMoney,
  moneyToCents,
  priceProblem,
  serviceSchema,
} from "./service";

const valid = { name: "Corte masculino", category: "cabelo", description: "", duration: "30", price: "45,00" };

describe("moneyToCents", () => {
  it("converte formatos comuns em centavos", () => {
    expect(moneyToCents("45")).toBe(4500);
    expect(moneyToCents("45,5")).toBe(4550);
    expect(moneyToCents("45,50")).toBe(4550);
    expect(moneyToCents("1.250,00")).toBe(125000);
    expect(moneyToCents("R$ 45,00")).toBe(4500);
    expect(moneyToCents("45.50")).toBe(4550);
    expect(moneyToCents("0,00")).toBe(0);
  });

  it("rejeita o que não é dinheiro válido", () => {
    expect(moneyToCents("")).toBeNull();
    expect(moneyToCents("abc")).toBeNull();
    expect(moneyToCents("-5")).toBeNull();
    expect(moneyToCents("45,555")).toBeNull();
    expect(moneyToCents("1.25")).toBe(125); // ponto com 2 casas é decimal
    expect(moneyToCents("100.001,00")).toBeNull(); // acima de R$ 100.000,00
  });
});

describe("máscara e exibição de dinheiro", () => {
  it("maskMoney entra pela direita", () => {
    expect(maskMoney("")).toBe("");
    expect(maskMoney("4")).toBe("0,04");
    expect(maskMoney("450")).toBe("4,50");
    expect(maskMoney("4500")).toBe("45,00");
    expect(maskMoney("R$ 1250,00")).toBe("1.250,00");
  });

  it("centsToInput e formatBRL", () => {
    expect(centsToInput(125000)).toBe("1.250,00");
    expect(centsToInput(5)).toBe("0,05");
    expect(formatBRL(4500)).toBe("R$ 45,00");
  });

  it("priceProblem só reclama de valor inválido", () => {
    expect(priceProblem("")).toBeNull();
    expect(priceProblem("45,00")).toBeNull();
    expect(priceProblem("abc")).toMatch(/inválido/i);
  });
});

describe("formatDuration", () => {
  it("formata minutos e horas", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h30");
    expect(formatDuration(105)).toBe("1h45");
    expect(formatDuration(180)).toBe("3h");
  });

  it("todas as durações oferecidas formatam sem NaN", () => {
    for (const m of DURATIONS) expect(formatDuration(m)).not.toMatch(/NaN/);
  });
});

describe("categorias", () => {
  it("estão em ordem alfabética, com Outros por último", () => {
    const labels = SERVICE_CATEGORIES.map((c) => c.label);
    const last = labels[labels.length - 1];
    expect(last).toBe("Outros");
    const rest = labels.slice(0, -1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });

  it("não repetem valor e categoryLabel traduz", () => {
    const values = SERVICE_CATEGORIES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
    expect(categoryLabel("quimica")).toBe("Químicas");
    expect(categoryLabel("desconhecida")).toBe("Outros");
    expect(categoryLabel(null)).toBe("Outros");
  });
});

describe("serviceSchema", () => {
  it("aceita um serviço válido e converte preço e duração", () => {
    const r = serviceSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.price).toBe(4500);
      expect(r.data.duration).toBe(30);
      expect(r.data.description).toBeNull();
    }
  });

  it("aceita preço zero (serviço sem custo)", () => {
    expect(serviceSchema.safeParse({ ...valid, price: "0,00" }).success).toBe(true);
  });

  it("rejeita nome curto ou longo", () => {
    expect(serviceSchema.safeParse({ ...valid, name: "A" }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...valid, name: "x".repeat(81) }).success).toBe(false);
  });

  it("rejeita categoria desconhecida", () => {
    expect(serviceSchema.safeParse({ ...valid, category: "hack" }).success).toBe(false);
  });

  it("rejeita duração fora da lista", () => {
    expect(serviceSchema.safeParse({ ...valid, duration: "7" }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...valid, duration: "abc" }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...valid, duration: "" }).success).toBe(false);
  });

  it("rejeita preço vazio ou inválido", () => {
    expect(serviceSchema.safeParse({ ...valid, price: "" }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...valid, price: "abc" }).success).toBe(false);
  });

  it("rejeita descrição acima de 300 caracteres", () => {
    expect(serviceSchema.safeParse({ ...valid, description: "x".repeat(301) }).success).toBe(false);
    expect(serviceSchema.safeParse({ ...valid, description: "x".repeat(300) }).success).toBe(true);
  });
});

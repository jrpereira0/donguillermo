import { describe, expect, it } from "vitest";
import { expectedCash, ticketTotals } from "./math";

describe("ticketTotals", () => {
  it("soma itens e limita o desconto ao subtotal", () => {
    expect(
      ticketTotals(
        [
          { quantity: 1, unitPriceCents: 4500 },
          { quantity: 2, unitPriceCents: 1500 },
        ],
        1000,
      ),
    ).toEqual({ subtotal: 7500, coveredCents: 0, discount: 1000, tip: 0, total: 6500 });
    expect(ticketTotals([{ quantity: 1, unitPriceCents: 4000 }], 0, 600).total).toBe(4600);
    expect(ticketTotals([{ quantity: 1, unitPriceCents: 2000 }], 9000).discount).toBe(2000);
  });

  it("serviço pelo pacote não é cobrado de novo, mas o valor fica registrado", () => {
    expect(
      ticketTotals(
        [
          { quantity: 1, unitPriceCents: 5000, packageCovered: true },
          { quantity: 1, unitPriceCents: 3000 },
        ],
        0,
      ),
    ).toEqual({ subtotal: 3000, coveredCents: 5000, discount: 0, tip: 0, total: 3000 });
    // Só itens de pacote: total zero (fecha sem pagamento).
    expect(ticketTotals([{ quantity: 2, unitPriceCents: 5000, packageCovered: true }], 0).total).toBe(0);
  });
});

describe("expectedCash", () => {
  it("fundo + suprimento − sangria + dinheiro", () => {
    expect(
      expectedCash({ openingCents: 10000, suprimentoCents: 5000, sangriaCents: 2000, dinheiroCents: 4500 }),
    ).toBe(17500);
  });
});

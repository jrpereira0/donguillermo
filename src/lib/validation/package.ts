import { z } from "zod";
import { parsePercentBR, type PackagePriceMode } from "@/lib/packages/math";
import { moneyToCents } from "@/lib/validation/service";

export const packageItemInputSchema = z.object({
  serviceId: z.string().uuid("Serviço inválido."),
  quantity: z.number().int().min(1, "Quantidade mínima 1.").max(50, "Quantidade máxima 50."),
});

/**
 * Cadastro do pacote. O preço é definido de duas formas:
 * - 'desconto': percentual (0 a 90) sobre a soma dos serviços;
 * - 'fixo': valor fechado em R$ (sem passar da soma dos serviços — conferido
 *   na action, que conhece os preços).
 */
export const packageSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome do pacote.").max(80, "Nome muito longo (máx. 80 caracteres)."),
    description: z
      .string()
      .trim()
      .max(300, "Descrição muito longa (máx. 300 caracteres).")
      .transform((v) => (v === "" ? null : v)),
    priceMode: z.enum(["desconto", "fixo"], { error: "Escolha como definir o valor do pacote." }),
    discountPct: z.string().trim(),
    fixedPrice: z.string().trim(),
    validityDays: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 730), "Validade inválida (1 a 730 dias, ou deixe vazio).")
      .transform((v) => (v === null ? null : Number(v))),
  })
  .superRefine((v, ctx) => {
    if (v.priceMode === "desconto") {
      const n = parsePercentBR(v.discountPct);
      if (v.discountPct === "" || !Number.isFinite(n) || n < 0 || n > 90) {
        ctx.addIssue({
          code: "custom",
          path: ["discountPct"],
          message: "Desconto inválido. Use de 0 a 90 (ex.: 20 ou 20,5).",
        });
      }
    } else {
      const cents = v.fixedPrice === "" ? null : moneyToCents(v.fixedPrice);
      if (cents === null || cents < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["fixedPrice"],
          message: "Informe o valor fixo do pacote. Ex.: 300,00.",
        });
      }
    }
  })
  .transform((v) => ({
    name: v.name,
    description: v.description,
    priceMode: v.priceMode as PackagePriceMode,
    discountPct: v.priceMode === "desconto" ? parsePercentBR(v.discountPct) : 0,
    fixedPriceCents: v.priceMode === "fixo" ? (moneyToCents(v.fixedPrice) ?? 0) : null,
    validityDays: v.validityDays,
  }));

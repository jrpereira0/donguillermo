import { z } from "zod";
import { parsePercentBR } from "@/lib/packages/math";

export const packageItemInputSchema = z.object({
  serviceId: z.string().uuid("Serviço inválido."),
  quantity: z.number().int().min(1, "Quantidade mínima 1.").max(50, "Quantidade máxima 50."),
});

export const packageSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do pacote.").max(80, "Nome muito longo (máx. 80 caracteres)."),
  description: z
    .string()
    .trim()
    .max(300, "Descrição muito longa (máx. 300 caracteres).")
    .transform((v) => (v === "" ? null : v)),
  discountPct: z
    .string()
    .trim()
    .min(1, "Informe o desconto do pacote (0 a 90%).")
    .refine((v) => {
      const n = parsePercentBR(v);
      return Number.isFinite(n) && n >= 0 && n <= 90;
    }, "Desconto inválido. Use de 0 a 90 (ex.: 20 ou 20,5).")
    .transform((v) => parsePercentBR(v)),
  validityDays: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 730), "Validade inválida (1 a 730 dias, ou deixe vazio).")
    .transform((v) => (v === null ? null : Number(v))),
});

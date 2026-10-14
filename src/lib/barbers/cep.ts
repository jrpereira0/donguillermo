import "server-only";
import { z } from "zod";

export type CepResult =
  | { ok: true; address: { street: string; neighborhood: string; city: string; state: string } }
  | { ok: false; message: string };

const viaCepSchema = z.object({
  logradouro: z.string().optional().default(""),
  bairro: z.string().optional().default(""),
  localidade: z.string().optional().default(""),
  uf: z.string().optional().default(""),
  erro: z.union([z.boolean(), z.string()]).optional(),
});

/**
 * Consulta o CEP no ViaCEP (serviço público e gratuito), SEMPRE pelo servidor:
 * o navegador não fala com terceiros, o uso é limitado por usuário (na action)
 * e a resposta é validada antes de chegar à tela. `digits` já deve ter 8 dígitos.
 */
export async function lookupCep(digits: string): Promise<CepResult> {
  if (!/^[0-9]{8}$/.test(digits)) return { ok: false, message: "CEP inválido (8 dígitos)." };
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, message: "Não foi possível consultar o CEP agora." };
    const parsed = viaCepSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.erro) return { ok: false, message: "CEP não encontrado." };
    const d = parsed.data;
    return {
      ok: true,
      address: {
        street: d.logradouro.slice(0, 120),
        neighborhood: d.bairro.slice(0, 80),
        city: d.localidade.slice(0, 80),
        state: d.uf.toUpperCase().slice(0, 2),
      },
    };
  } catch {
    return { ok: false, message: "Não foi possível consultar o CEP agora." };
  }
}

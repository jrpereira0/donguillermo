import "server-only";

/**
 * Limitador de taxa em memória (janela fixa). Serve para desenvolvimento e
 * para uma única instância. Em produção na Vercel (várias instâncias, sem
 * memória compartilhada) troque a implementação por Redis/Upstash mantendo
 * esta mesma assinatura — ver docs/seguranca.md.
 */
type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  // Limpeza preguiçosa para o Map não crescer sem fim.
  if (store.size > 5000) {
    for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
  }

  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (current.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { ok: true, remaining: limit - current.count };
}

export function resetRateLimit(key: string) {
  store.delete(key);
}

export function formatRetry(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "1 minuto" : `${minutes} minutos`;
}

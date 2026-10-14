/**
 * Aceita apenas caminhos internos ("/algo"). Bloqueia URLs externas,
 * protocol-relative ("//evil.com") e barras invertidas — evita open redirect.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

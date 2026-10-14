import "server-only";
import { headers } from "next/headers";

/** IP do cliente (atrás de proxy/Vercel usa x-forwarded-for). */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "local";
}

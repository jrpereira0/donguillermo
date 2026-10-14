import { getPublicEnv } from "@/lib/env";
import { CUSTOMER_PHOTO_BUCKET } from "./types";

/** URL pública da foto (o bucket é público para leitura). `version` evita cache velho. */
export function customerPhotoUrl(path: string | null | undefined, version?: string): string | null {
  if (!path) return null;
  const base = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${base}/storage/v1/object/public/${CUSTOMER_PHOTO_BUCKET}/${path}${v}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** O caminho aceito é exatamente `<cliente>.(webp|jpg|png)` (sem pastas). */
export function isValidCustomerPhotoPath(path: string, customerId: string): boolean {
  return (
    new RegExp(`^${UUID}\\.(webp|jpg|png)$`, "i").test(path) &&
    path.toLowerCase().startsWith(`${customerId.toLowerCase()}.`)
  );
}

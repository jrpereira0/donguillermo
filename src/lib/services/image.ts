import { getPublicEnv } from "@/lib/env";
import { SERVICE_IMAGE_BUCKET } from "./types";

/** URL pública da imagem (o bucket é público para leitura). `version` evita cache velho. */
export function serviceImageUrl(path: string | null | undefined, version?: string): string | null {
  if (!path) return null;
  const base = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${base}/storage/v1/object/public/${SERVICE_IMAGE_BUCKET}/${path}${v}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** O caminho aceito é exatamente `<unidade>/<serviço>.(webp|jpg|png)`. */
export function isValidServiceImagePath(path: string, unitId: string, serviceId: string): boolean {
  return (
    new RegExp(`^${UUID}/${UUID}\\.(webp|jpg|png)$`, "i").test(path) &&
    path.toLowerCase().startsWith(`${unitId.toLowerCase()}/${serviceId.toLowerCase()}.`)
  );
}

import { getPublicEnv } from "@/lib/env";
import { UNIT_ASSET_BUCKET } from "./types";

/** URL pública da logo/capa (o bucket é público para leitura). Cada envio ganha nome novo: sem cache velho. */
export function unitAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${UNIT_ASSET_BUCKET}/${path}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** O caminho aceito é exatamente `<unidade>/<uuid>.(webp|jpg|png)`, dentro da pasta da própria unidade. */
export function isValidUnitAssetPath(path: string, unitId: string): boolean {
  return (
    new RegExp(`^${UUID}/${UUID}\\.(webp|jpg|png)$`, "i").test(path) &&
    path.toLowerCase().startsWith(`${unitId.toLowerCase()}/`)
  );
}

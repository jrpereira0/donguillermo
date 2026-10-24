import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type BarberCommissionAdminRow = {
  id: string;
  name: string;
  unitName: string;
  isActive: boolean;
  /** % próprio de serviços; null = tabela da rede. */
  servicesPct: number | null;
  /** % próprio de produtos; null = % da rede. */
  productsPct: number | null;
};

const own = (v: number | string | null): number | null => (v === null ? null : Number(v));

/**
 * Todos os profissionais da rede com o % próprio de cada um (painel do admin).
 * Service role: só chamar depois de `requireNetworkAdmin()`.
 */
export async function listBarbersCommissionAdmin(): Promise<BarberCommissionAdminRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("barbers")
    .select("id, display_name, is_active, commission_services_pct, commission_products_pct, units(name)")
    .order("display_name", { ascending: true })
    .returns<
      {
        id: string;
        display_name: string;
        is_active: boolean;
        commission_services_pct: number | string | null;
        commission_products_pct: number | string | null;
        units: { name: string } | { name: string }[] | null;
      }[]
    >();
  if (error) {
    console.error("[admin] barbers commission:", error.code);
    return [];
  }
  return (data ?? []).map((b) => {
    const unit = Array.isArray(b.units) ? b.units[0] : b.units;
    return {
      id: b.id,
      name: b.display_name,
      unitName: unit?.name ?? "—",
      isActive: b.is_active,
      servicesPct: own(b.commission_services_pct),
      productsPct: own(b.commission_products_pct),
    };
  });
}

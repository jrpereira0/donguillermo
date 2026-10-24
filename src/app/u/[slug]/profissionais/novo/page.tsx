import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BarberForm, EMPTY_DEFAULTS } from "@/components/unit/barber-form";
import { PageHeader } from "@/components/unit/page-header";
import { requireUnitArea } from "@/lib/auth/guards";
import { getNetworkProductsPct } from "@/lib/commissions/queries";
import { listAssignableServices } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Novo profissional" };
export const instant = false;

export default async function NovoProfissionalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { unit } = await requireUnitArea(slug, "profissionais");
  const [services, networkProductsPct] = await Promise.all([
    listAssignableServices(unit.id),
    getNetworkProductsPct(),
  ]);
  const defaults = {
    ...EMPTY_DEFAULTS,
    commissionProductsLabel: `${String(networkProductsPct).replace(".", ",")}% (rede)`,
  };

  return (
    <div className="flex flex-col gap-8">
      <Link
        href={`/u/${slug}/profissionais`}
        className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1"
      >
        <ArrowLeft className="size-3.5" />
        Profissionais
      </Link>
      <PageHeader
        eyebrow="Equipe"
        title="Novo profissional"
        description="Cadastre um novo profissional."
      />
      <BarberForm
        mode="create"
        slug={slug}
        unitId={unit.id}
        barberId={crypto.randomUUID()}
        defaults={defaults}
        services={services}
      />
    </div>
  );
}

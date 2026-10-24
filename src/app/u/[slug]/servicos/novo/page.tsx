import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/unit/page-header";
import { EMPTY_SERVICE_DEFAULTS, ServiceForm } from "@/components/unit/service-form";
import { requireUnitArea } from "@/lib/auth/guards";
import { listAssignableBarbers } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Novo serviço" };
export const instant = false;

export default async function NovoServicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { unit } = await requireUnitArea(slug, "servicos");
  const barbers = await listAssignableBarbers(unit.id);

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/u/${slug}/servicos`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Serviços
      </Link>
      <PageHeader eyebrow="Catálogo" title="Novo serviço" description="Cadastre um novo serviço." />
      <ServiceForm mode="create" slug={slug} unitId={unit.id} barbers={barbers} serviceId={crypto.randomUUID()} defaults={EMPTY_SERVICE_DEFAULTS} />
    </div>
  );
}

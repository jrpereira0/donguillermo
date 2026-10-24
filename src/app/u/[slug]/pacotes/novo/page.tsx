import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/unit/page-header";
import { EMPTY_PACKAGE_DEFAULTS, PackageForm } from "@/components/unit/package-form";
import { requireUnitArea } from "@/lib/auth/guards";
import { listServices } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Novo pacote" };
export const instant = false;

export default async function NovoPacotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { unit } = await requireUnitArea(slug, "pacotes");
  const services = (await listServices(unit.id))
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, name: s.name, priceCents: s.price_cents }));

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/u/${slug}/pacotes`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Pacotes
      </Link>
      <PageHeader
        eyebrow="Catálogo"
        title="Novo pacote"
        description="Cadastre um novo pacote."
      />
      <PackageForm mode="create" slug={slug} defaults={EMPTY_PACKAGE_DEFAULTS} services={services} />
    </div>
  );
}

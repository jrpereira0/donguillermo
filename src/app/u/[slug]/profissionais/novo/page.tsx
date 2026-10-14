import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BarberForm, EMPTY_DEFAULTS } from "@/components/unit/barber-form";
import { PageHeader } from "@/components/unit/page-header";
import { requireUnitArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Novo profissional" };
export const instant = false;

export default async function NovoProfissionalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { unit } = await requireUnitArea(slug, "profissionais");

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
        description="Cadastre a ficha e o login de acesso do barbeiro."
      />
      <BarberForm
        mode="create"
        slug={slug}
        unitId={unit.id}
        barberId={crypto.randomUUID()}
        defaults={EMPTY_DEFAULTS}
      />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { BarberList, type BarberListItem } from "@/components/unit/barber-list";
import { EmptyState } from "@/components/unit/empty-state";
import { PageHeader } from "@/components/unit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/notice";
import { requireUnitArea } from "@/lib/auth/guards";
import { barberPhotoUrl } from "@/lib/barbers/photo";
import { listBarbers } from "@/lib/barbers/queries";
import { jobTitleLabel, maskPhone, phoneDigits } from "@/lib/validation/barber";

export const metadata: Metadata = { title: "Profissionais" };
export const instant = false;

export default async function ProfissionaisPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { slug } = await params;
  const { aviso } = await searchParams;
  const { unit } = await requireUnitArea(slug, "profissionais"); // só recepção (ou admin) desta unidade
  const barbers = await listBarbers(unit.id);
  const base = `/u/${slug}/profissionais`;

  const items: BarberListItem[] = barbers.map((b) => ({
    id: b.id,
    displayName: b.display_name,
    fullName: b.full_name,
    jobTitle: jobTitleLabel(b.job_title),
    photoUrl: barberPhotoUrl(b.photo_path, b.updated_at),
    phone: b.phone ? maskPhone(b.phone) : null,
    phoneDigits: b.phone ? phoneDigits(b.phone) : null,
    email: b.profiles?.email ?? null,
    active: b.is_active,
  }));

  const newButton = (
    <Link href={`${base}/novo`} className={buttonVariants({ variant: "luxe", size: "lg", className: "w-full sm:w-auto" })}>
      <Plus />
      Novo profissional
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Equipe"
        title="Profissionais"
        description="Profissionais da unidade."
        action={barbers.length ? newButton : undefined}
      />

      {aviso === "parcial" ? (
        <FlashNotice title="Profissional cadastrado">
          Não foi possível vincular os serviços. Abra o profissional, vá em Serviços e salve de novo.
        </FlashNotice>
      ) : null}
      {aviso === "criado" ? (
        <FlashNotice title="Profissional cadastrado">O acesso dele ao sistema já está liberado.</FlashNotice>
      ) : null}

      {barbers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum profissional ainda"
          description="Cadastre o primeiro barbeiro para começar a montar a agenda."
          action={newButton}
        />
      ) : (
        <BarberList slug={slug} barbers={items} />
      )}
    </div>
  );
}

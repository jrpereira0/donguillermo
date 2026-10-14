import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { BarberList, type BarberListItem } from "@/components/unit/barber-list";
import { PageHeader } from "@/components/unit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/notice";
import { LuxeFrame } from "@/components/ui/luxe-frame";
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
        description="Barbeiros da unidade, com acesso próprio ao sistema."
        action={barbers.length ? newButton : undefined}
      />

      {aviso === "criado" ? (
        <FlashNotice title="Profissional cadastrado">O acesso dele ao sistema já está liberado.</FlashNotice>
      ) : null}

      {barbers.length === 0 ? (
        <LuxeFrame
          className="reveal"
          style={{ "--d": "150ms" } as React.CSSProperties}
          contentClassName="flex flex-col items-center gap-4 px-6 py-12 text-center"
        >
          <Users className="size-8 text-gold" aria-hidden="true" />
          <div>
            <p className="font-heading text-lg uppercase tracking-wide">Nenhum profissional ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre o primeiro barbeiro para começar a montar a agenda.
            </p>
          </div>
          {newButton}
        </LuxeFrame>
      ) : (
        <BarberList slug={slug} barbers={items} />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Scissors } from "lucide-react";
import { EmptyState } from "@/components/unit/empty-state";
import { PageHeader } from "@/components/unit/page-header";
import { ServiceIcon } from "@/components/unit/service-icon";
import { ServiceList, type ServiceListItem } from "@/components/unit/service-list";
import { buttonVariants } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/notice";
import { requireUnitArea } from "@/lib/auth/guards";
import { serviceImageUrl } from "@/lib/services/image";
import { listAssignableBarbers, listServiceBarberLinks, listServices } from "@/lib/services/queries";
import { SERVICE_CATEGORIES, categoryLabel, formatBRL, formatDuration } from "@/lib/validation/service";

export const metadata: Metadata = { title: "Serviços" };
export const instant = false;

export default async function ServicosPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { slug } = await params;
  const { aviso } = await searchParams;
  const { unit } = await requireUnitArea(slug, "servicos"); // cada página valida o acesso: o layout não re-executa na navegação
  const [services, barbers, links] = await Promise.all([
    listServices(unit.id),
    listAssignableBarbers(unit.id),
    listServiceBarberLinks(unit.id),
  ]);
  const base = `/u/${slug}/servicos`;

  const items: ServiceListItem[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    imageUrl: serviceImageUrl(s.image_path, s.updated_at),
    categoryLabel: categoryLabel(s.category),
    // Só profissionais ativos aparecem (os inativos saem da lista, mas a ligação fica guardada).
    barbers: barbers
      .filter((b) => (links[s.id] ?? []).some((l) => l.barberId === b.id))
      .map((b) => ({ id: b.id, name: b.name, photoUrl: b.photoUrl })),
    durationLabel: formatDuration(s.duration_minutes),
    priceLabel: formatBRL(s.price_cents),
    active: s.is_active,
  }));

  const newButton = (
    <Link href={`${base}/novo`} className={buttonVariants({ variant: "luxe", size: "lg", className: "w-full sm:w-auto" })}>
      <Plus />
      Novo serviço
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Catálogo"
        title="Serviços"
        description="O que a unidade oferece, com preço e duração."
        action={services.length ? newButton : undefined}
      />

      {aviso === "parcial" ? (
        <FlashNotice title="Serviço cadastrado">
          Não foi possível vincular os profissionais. Abra o serviço, vá em Profissionais e salve de novo.
        </FlashNotice>
      ) : null}
      {aviso === "criado" ? (
        <FlashNotice title="Serviço cadastrado">Ele já pode ser usado na agenda.</FlashNotice>
      ) : null}

      {services.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="Monte o catálogo da unidade"
          description="Cadastre os serviços com preço e duração. É com eles que a agenda calcula horários e valores."
          action={newButton}
        >
          <div className="mt-9 flex w-full max-w-xl flex-col items-center gap-3 border-t border-border pt-6">
            <span className="label-caps text-[0.65rem]">Categorias disponíveis</span>
            <ul className="flex flex-wrap justify-center gap-2">
              {SERVICE_CATEGORIES.map((c) => (
                <li
                  key={c.value}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-black/20 px-3.5 py-1.5 text-sm text-muted-foreground"
                >
                  <ServiceIcon category={c.value} className="size-3.5 text-gold" />
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        </EmptyState>
      ) : (
        <ServiceList slug={slug} services={items} />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Power } from "lucide-react";
import { FormSection } from "@/components/unit/form-parts";
import { PageHeader } from "@/components/unit/page-header";
import { ServiceForm, type ServiceDefaults } from "@/components/unit/service-form";
import { Button } from "@/components/ui/button";
import { requireUnitArea } from "@/lib/auth/guards";
import { serviceImageUrl } from "@/lib/services/image";
import { getService, listAssignableBarbers, listServiceBarberLinks } from "@/lib/services/queries";
import type { ServiceBarberLink, ServiceRow } from "@/lib/services/types";
import { categoryLabel, centsToInput, formatBRL, formatDuration } from "@/lib/validation/service";
import { toggleServiceActiveAction } from "../actions";

export const metadata: Metadata = { title: "Editar serviço" };
export const instant = false;

function toDefaults(s: ServiceRow, links: ServiceBarberLink[]): ServiceDefaults {
  return {
    name: s.name,
    category: s.category,
    description: s.description ?? "",
    duration: String(s.duration_minutes),
    price: centsToInput(s.price_cents),
    imagePath: s.image_path ?? "",
    imageUrl: serviceImageUrl(s.image_path, s.updated_at),
    barberMinutes: Object.fromEntries(links.map((l) => [l.barberId, l.minutes ? String(l.minutes) : ""])),
  };
}

export default async function EditarServicoPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { unit } = await requireUnitArea(slug, "servicos");
  const service = await getService(unit.id, id);
  if (!service) notFound();
  const [barbers, links] = await Promise.all([listAssignableBarbers(unit.id), listServiceBarberLinks(unit.id)]);

  const editStatus = (
    <FormSection
      icon={Power}
      title={service.is_active ? "Desativar serviço" : "Reativar serviço"}
      description={
        service.is_active
          ? "Some das listas e da agenda. O histórico continua guardado e dá para reativar."
          : "Volta às listas e à agenda."
      }
    >
      <form action={toggleServiceActiveAction.bind(null, slug, service.id, !service.is_active)}>
        <Button type="submit" variant="outline" size="sm">
          <Power />
          {service.is_active ? "Desativar" : "Reativar"}
        </Button>
      </form>
    </FormSection>
  );

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/u/${slug}/servicos`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Serviços
      </Link>
      <PageHeader
        eyebrow="Catálogo"
        title={service.name}
        description={`${categoryLabel(service.category)} · ${formatDuration(service.duration_minutes)} · ${formatBRL(service.price_cents)}`}
      />
      <ServiceForm
        mode="edit"
        slug={slug}
        unitId={unit.id}
        serviceId={service.id}
        defaults={toDefaults(service, links[service.id] ?? [])}
        barbers={barbers}
        editStatus={editStatus}
      />
    </div>
  );
}

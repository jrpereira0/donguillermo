import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound, Power } from "lucide-react";
import { BarberForm, type BarberDefaults } from "@/components/unit/barber-form";
import { BarberPasswordForm } from "@/components/unit/barber-password-form";
import { FormSection } from "@/components/unit/form-parts";
import { PageHeader } from "@/components/unit/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitForm } from "@/components/ui/confirm-submit-form";
import { requireUnitArea } from "@/lib/auth/guards";
import { barberPhotoUrl } from "@/lib/barbers/photo";
import { getBarber } from "@/lib/barbers/queries";
import type { BarberRow } from "@/lib/barbers/types";
import { getBarberServiceMinutes, listAssignableServices } from "@/lib/services/queries";
import { formatCep, maskCnpj, maskPhone } from "@/lib/validation/barber";
import { toggleBarberActiveAction } from "../actions";

export const metadata: Metadata = { title: "Editar profissional" };
export const instant = false;

const num = (n: number) => String(n).replace(".", ",");

/** Cadastros anteriores à separação nome/sobrenome: divide o nome completo no primeiro espaço. */
function splitName(b: BarberRow): { first: string; last: string } {
  if (b.first_name || b.last_name) return { first: b.first_name ?? "", last: b.last_name ?? "" };
  const [first = "", ...rest] = b.full_name.trim().split(/\s+/);
  return { first, last: rest.join(" ") };
}

function toDefaults(b: BarberRow, serviceMinutes: Record<string, string>): BarberDefaults {
  const social = (b.social && typeof b.social === "object" ? b.social : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof social[k] === "string" ? (social[k] as string) : "");
  const { first, last } = splitName(b);
  return {
    firstName: first,
    lastName: last,
    displayName: b.display_name,
    jobTitle: b.job_title,
    phone: maskPhone(b.phone),
    birthDate: b.birth_date ?? "",
    cnpj: maskCnpj(b.cnpj),
    cep: formatCep(b.cep),
    street: b.street ?? "",
    streetNumber: b.street_number ?? "",
    complement: b.complement ?? "",
    neighborhood: b.neighborhood ?? "",
    city: b.city ?? "",
    state: b.state ?? "",
    instagram: s("instagram"),
    facebook: s("facebook"),
    tiktok: s("tiktok"),
    commissionProducts: num(b.commission_products_pct),
    workHours: b.work_hours,
    photoPath: b.photo_path ?? "",
    photoUrl: barberPhotoUrl(b.photo_path, b.updated_at),
    serviceMinutes,
  };
}

export default async function EditarProfissionalPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const { unit } = await requireUnitArea(slug, "profissionais");
  const barber = await getBarber(unit.id, id);
  if (!barber) notFound();
  const [services, serviceMinutes] = await Promise.all([
    listAssignableServices(unit.id),
    getBarberServiceMinutes(unit.id, barber.id),
  ]);

  const editAccess = (
    <>
      <FormSection
        icon={KeyRound}
        title="Acesso ao sistema"
        description={
          barber.profiles
            ? `Login: ${barber.profiles.email}. O e-mail não muda aqui.`
            : "Este profissional não tem login."
        }
      >
        {barber.user_id ? <BarberPasswordForm slug={slug} barberId={barber.id} /> : null}
      </FormSection>

      <FormSection
        icon={Power}
        title={barber.is_active ? "Desativar profissional" : "Reativar profissional"}
        description={
          barber.is_active
            ? "Some das listas e perde o acesso ao sistema. Os dados ficam guardados e dá para reativar."
            : "Volta às listas e recupera o acesso ao sistema."
        }
      >
        {barber.is_active ? (
          <ConfirmSubmitForm
            action={toggleBarberActiveAction.bind(null, slug, barber.id, false)}
            label={
              <>
                <Power />
                Desativar
              </>
            }
            title={`Desativar ${barber.display_name}?`}
            description="Ele some das listas, da agenda e perde o acesso ao sistema. Os dados e o histórico ficam guardados e dá para reativar depois."
            confirmLabel="Sim, desativar"
          />
        ) : (
          <form action={toggleBarberActiveAction.bind(null, slug, barber.id, true)}>
            <Button type="submit" variant="outline" size="sm">
              <Power />
              Reativar
            </Button>
          </form>
        )}
      </FormSection>
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <Link
        href={`/u/${slug}/profissionais`}
        className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1"
      >
        <ArrowLeft className="size-3.5" />
        Profissionais
      </Link>
      <PageHeader eyebrow="Equipe" title={barber.display_name} description={barber.full_name} />

      <BarberForm
        mode="edit"
        slug={slug}
        unitId={unit.id}
        barberId={barber.id}
        defaults={toDefaults(barber, serviceMinutes)}
        services={services}
        editAccess={editAccess}
      />
    </div>
  );
}

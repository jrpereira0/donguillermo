import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/unit/page-header";
import { UnitSettingsForm, type UnitSettingsDefaults } from "@/components/unit/unit-settings-form";
import { requireUnitArea } from "@/lib/auth/guards";
import { getUnitSettings, listActiveServiceDurations } from "@/lib/units/queries";
import { unitAssetUrl } from "@/lib/units/assets";
import { isValidPhone, phoneDigits } from "@/lib/validation/barber";
import { phonesFromDb } from "@/lib/validation/unit-settings";

export const metadata: Metadata = { title: "Configurações" };
export const instant = false;

export default async function ConfiguracoesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { unit } = await requireUnitArea(slug, "configuracoes"); // cada página valida o acesso: o layout não re-executa na navegação

  const [settings, durations] = await Promise.all([getUnitSettings(unit.id), listActiveServiceDurations(unit.id)]);
  if (!settings) notFound();

  // Unidade criada antes desta tela: o telefone único antigo vira a primeira linha da lista.
  let phones = phonesFromDb(settings.phones);
  if (phones.length === 0 && settings.phone && isValidPhone(settings.phone)) {
    phones = [{ label: "Recepção", number: phoneDigits(settings.phone), whatsapp: false }];
  }

  const defaults: UnitSettingsDefaults = {
    name: settings.name,
    cnpj: settings.cnpj ?? "",
    cep: settings.cep ?? "",
    street: settings.street ?? "",
    streetNumber: settings.street_number ?? "",
    complement: settings.complement ?? "",
    neighborhood: settings.neighborhood ?? "",
    city: settings.city ?? "",
    state: settings.state ?? "",
    slotMinutes: settings.slot_minutes,
    openingHours: settings.opening_hours,
    phones,
    logoPath: settings.logo_path ?? "",
    logoUrl: unitAssetUrl(settings.logo_path),
    coverPath: settings.cover_path ?? "",
    coverUrl: unitAssetUrl(settings.cover_path),
    legacyAddress: settings.address,
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Unidade"
        title="Configurações"
        description="Dados da barbearia: marca, contato, horário de funcionamento e tempo da agenda."
      />
      <UnitSettingsForm slug={slug} unitId={settings.id} defaults={defaults} serviceDurations={durations} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Power } from "lucide-react";
import { CustomerForm, type CustomerDefaults } from "@/components/unit/customer-form";
import { CustomerHistory } from "@/components/unit/customer-history";
import { CustomerNotes } from "@/components/unit/customer-notes";
import { CustomerPackages } from "@/components/unit/customer-packages";
import { FormSection } from "@/components/unit/form-parts";
import { PageHeader } from "@/components/unit/page-header";
import { Button } from "@/components/ui/button";
import { requireUnitArea } from "@/lib/auth/guards";
import { customerPhotoUrl } from "@/lib/customers/photo";
import { getCustomer, listCustomerHistory, listCustomerNotes, listNetworkUnitNames } from "@/lib/customers/queries";
import { listCustomerPackages, listPackageUses, listPackages } from "@/lib/packages/queries";
import type { CustomerRow } from "@/lib/customers/types";
import { ageFrom } from "@/lib/validation/customer";
import { toggleCustomerActiveAction } from "../actions";

export const metadata: Metadata = { title: "Cliente" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

function toDefaults(c: CustomerRow): CustomerDefaults {
  return {
    fullName: c.full_name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    birthDate: c.birth_date ?? "",
    cpf: c.cpf ?? "",
    cep: c.cep ?? "",
    street: c.street ?? "",
    streetNumber: c.street_number ?? "",
    complement: c.complement ?? "",
    neighborhood: c.neighborhood ?? "",
    city: c.city ?? "",
    state: c.state ?? "",
    referralSource: c.referral_source ?? "",
    marketingConsent: c.marketing_consent,
    photoPath: c.photo_path ?? "",
    photoUrl: customerPhotoUrl(c.photo_path, c.updated_at),
  };
}

export default async function EditarClientePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { unit } = await requireUnitArea(slug, "clientes");
  if (!UUID.test(id)) notFound();
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const [units, history, customerPackages, packageUses, catalog] = await Promise.all([
    listNetworkUnitNames(),
    listCustomerHistory(customer.id),
    listCustomerPackages(unit.id, customer.id),
    listPackageUses(unit.id, customer.id),
    listPackages(unit.id),
  ]);
  const notes = await listCustomerNotes(customer.id, units);

  const origin = customer.created_unit_id ? (units[customer.created_unit_id] ?? null) : null;
  const age = ageFrom(customer.birth_date);
  const description = [
    age !== null ? `${age} anos` : null,
    `Cliente desde ${dateFmt.format(new Date(customer.created_at))}`,
    origin ? `cadastrado em ${origin}` : null,
    customer.registered_via === "autocadastro" ? "autocadastro" : null,
    customer.is_active ? null : "inativo",
  ]
    .filter(Boolean)
    .join(" · ");

  const editStatus = (
    <FormSection
      icon={Power}
      title={customer.is_active ? "Desativar cliente" : "Reativar cliente"}
      description={
        customer.is_active
          ? "Some da busca padrão e da agenda. O histórico continua guardado e dá para reativar."
          : "Volta à busca e à agenda."
      }
    >
      <form action={toggleCustomerActiveAction.bind(null, slug, customer.id, !customer.is_active)}>
        <Button type="submit" variant="outline" size="sm">
          <Power />
          {customer.is_active ? "Desativar" : "Reativar"}
        </Button>
      </form>
    </FormSection>
  );

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/u/${slug}/clientes`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Clientes
      </Link>
      <PageHeader eyebrow="Relacionamento" title={customer.full_name} description={description} />
      <CustomerForm
        mode="edit"
        slug={slug}
        customerId={customer.id}
        defaults={toDefaults(customer)}
        editNotes={<CustomerNotes slug={slug} customerId={customer.id} notes={notes} />}
        editPackages={
          <CustomerPackages
            slug={slug}
            customerId={customer.id}
            packages={customerPackages.filter((cp) => cp.status !== "cancelada")}
            uses={packageUses}
            sellOptions={catalog
              .filter((p) => p.isActive && p.items.length > 0)
              .map((p) => ({
                id: p.id,
                name: p.name,
                priceCents: p.priceCents,
                discountPct: p.discountPct,
                totalServices: p.items.reduce((n, i) => n + i.quantity, 0),
              }))}
          />
        }
        editHistory={<CustomerHistory slug={slug} entries={history} />}
        editStatus={editStatus}
      />
    </div>
  );
}

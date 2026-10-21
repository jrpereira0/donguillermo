import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Power, Users } from "lucide-react";
import { FormSection } from "@/components/unit/form-parts";
import { PageHeader } from "@/components/unit/page-header";
import { PackageForm, type PackageDefaults } from "@/components/unit/package-form";
import { PackageStatusChip } from "@/components/unit/package-status";
import { Button } from "@/components/ui/button";
import { requireUnitArea } from "@/lib/auth/guards";
import { getPackage, listPackageBuyers } from "@/lib/packages/queries";
import { listServices } from "@/lib/services/queries";
import { formatBRL } from "@/lib/validation/service";
import { togglePackageActiveAction } from "../actions";

export const metadata: Metadata = { title: "Editar pacote" };
export const instant = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
const fmtPct = (n: number) => `${String(n).replace(".", ",")}%`;

export default async function EditarPacotePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { unit } = await requireUnitArea(slug, "pacotes");
  if (!UUID.test(id)) notFound();
  const [pkg, allServices, buyers] = await Promise.all([
    getPackage(unit.id, id),
    listServices(unit.id),
    listPackageBuyers(unit.id, id),
  ]);
  if (!pkg) notFound();

  const services = allServices
    .filter((s) => s.is_active)
    .map((s) => ({ id: s.id, name: s.name, priceCents: s.price_cents }));

  const defaults: PackageDefaults = {
    name: pkg.name,
    description: pkg.description ?? "",
    discountPct: String(pkg.discountPct).replace(".", ","),
    validityDays: pkg.validityDays ? String(pkg.validityDays) : "",
    items: pkg.items.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity })),
  };

  const editStatus = (
    <>
      <FormSection
        icon={Power}
        title={pkg.isActive ? "Desativar pacote" : "Reativar pacote"}
        description={
          pkg.isActive
            ? "Some da venda na ficha do cliente. Quem já comprou continua usando o saldo normalmente."
            : "Volta a aparecer para venda na ficha do cliente."
        }
      >
        <form action={togglePackageActiveAction.bind(null, slug, pkg.id, !pkg.isActive)}>
          <Button type="submit" variant="outline" size="sm">
            <Power />
            {pkg.isActive ? "Desativar" : "Reativar"}
          </Button>
        </form>
      </FormSection>

      <FormSection icon={Users} title="Clientes com este pacote" description="Quem comprou e quanto saldo ainda resta para cada um.">
        {buyers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguém comprou ainda. Venda na ficha do cliente, aba Pacotes.
          </p>
        ) : (
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
            {buyers.map((b) => (
              <li key={b.cpId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <Link
                  href={`/u/${slug}/clientes/${b.customerId}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-cream hover:text-gold"
                >
                  {b.customerName}
                </Link>
                <span className="text-xs tabular-nums text-muted-foreground">
                  comprado em {dateFmt.format(new Date(b.soldAt))} · restam {b.remaining} de {b.total}
                </span>
                <PackageStatusChip status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </>
  );

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/u/${slug}/pacotes`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Pacotes
      </Link>
      <PageHeader
        eyebrow="Catálogo"
        title={pkg.name}
        description={`${pkg.items.map((i) => `${i.quantity}× ${i.serviceName}`).join(" · ")} · ${formatBRL(pkg.priceCents)}${
          pkg.discountPct > 0 ? ` (−${fmtPct(pkg.discountPct)})` : ""
        }${pkg.isActive ? "" : " · desativado"}`}
      />
      <PackageForm mode="edit" slug={slug} packageId={pkg.id} defaults={defaults} services={services} editStatus={editStatus} />
    </div>
  );
}

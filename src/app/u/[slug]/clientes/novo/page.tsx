import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerForm, EMPTY_CUSTOMER } from "@/components/unit/customer-form";
import { PageHeader } from "@/components/unit/page-header";
import { requireUnitArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Novo cliente" };
export const instant = false;

export default async function NovoClientePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireUnitArea(slug, "clientes");
  // O id nasce aqui para a foto já ter nome de arquivo antes de o cadastro existir.
  const customerId = crypto.randomUUID();

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/u/${slug}/clientes`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Clientes
      </Link>
      <PageHeader
        eyebrow="Relacionamento"
        title="Novo cliente"
        description="Cadastre um novo cliente."
      />
      <CustomerForm
        mode="create"
        slug={slug}
        customerId={customerId}
        defaults={EMPTY_CUSTOMER}
      />
    </div>
  );
}

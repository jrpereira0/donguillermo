import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/unit/page-header";
import { EMPTY_PRODUCT_DEFAULTS, ProductForm } from "@/components/unit/product-form";
import { requireUnitArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Novo produto" };
export const instant = false;

export default async function NovoProdutoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireUnitArea(slug, "produtos");

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/u/${slug}/produtos`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Produtos
      </Link>
      <PageHeader eyebrow="Catálogo" title="Novo produto" description="Cadastre o nome, a categoria e o preço." />
      <ProductForm mode="create" slug={slug} defaults={EMPTY_PRODUCT_DEFAULTS} />
    </div>
  );
}

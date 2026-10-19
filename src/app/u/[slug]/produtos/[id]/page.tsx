import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Power } from "lucide-react";
import { FormSection } from "@/components/unit/form-parts";
import { PageHeader } from "@/components/unit/page-header";
import { ProductForm, type ProductDefaults } from "@/components/unit/product-form";
import { Button } from "@/components/ui/button";
import { requireUnitArea } from "@/lib/auth/guards";
import { getProduct } from "@/lib/products/queries";
import type { ProductRow } from "@/lib/products/types";
import { productCategoryLabel } from "@/lib/validation/product";
import { centsToInput, formatBRL } from "@/lib/validation/service";
import { toggleProductActiveAction } from "../actions";

export const metadata: Metadata = { title: "Editar produto" };
export const instant = false;

function toDefaults(p: ProductRow): ProductDefaults {
  return {
    name: p.name,
    category: p.category,
    description: p.description ?? "",
    price: centsToInput(p.price_cents),
  };
}

export default async function EditarProdutoPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { unit } = await requireUnitArea(slug, "produtos");
  const product = await getProduct(unit.id, id);
  if (!product) notFound();

  const editStatus = (
    <FormSection
      icon={Power}
      title={product.is_active ? "Desativar produto" : "Reativar produto"}
      description={
        product.is_active
          ? "Some da venda na comanda. O histórico continua guardado e dá para reativar."
          : "Volta à lista e à comanda."
      }
    >
      <form action={toggleProductActiveAction.bind(null, slug, product.id, !product.is_active)}>
        <Button type="submit" variant="outline" size="sm">
          <Power />
          {product.is_active ? "Desativar" : "Reativar"}
        </Button>
      </form>
    </FormSection>
  );

  return (
    <div className="flex flex-col gap-8">
      <Link href={`/u/${slug}/produtos`} className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Produtos
      </Link>
      <PageHeader
        eyebrow="Catálogo"
        title={product.name}
        description={`${productCategoryLabel(product.category)} · ${formatBRL(product.price_cents)}`}
      />
      <ProductForm mode="edit" slug={slug} productId={product.id} defaults={toDefaults(product)} editStatus={editStatus} />
    </div>
  );
}

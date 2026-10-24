import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { EmptyState } from "@/components/unit/empty-state";
import { PageHeader } from "@/components/unit/page-header";
import { ProductIcon } from "@/components/unit/product-icon";
import { ProductList, type ProductListItem } from "@/components/unit/product-list";
import { buttonVariants } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/notice";
import { requireUnitArea } from "@/lib/auth/guards";
import { listProducts } from "@/lib/products/queries";
import { PRODUCT_CATEGORIES, productCategoryLabel } from "@/lib/validation/product";
import { formatBRL } from "@/lib/validation/service";

export const metadata: Metadata = { title: "Produtos" };
export const instant = false;

export default async function ProdutosPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { slug } = await params;
  const { aviso } = await searchParams;
  const { unit } = await requireUnitArea(slug, "produtos");
  const products = await listProducts(unit.id);
  const base = `/u/${slug}/produtos`;

  const items: ProductListItem[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    categoryLabel: productCategoryLabel(p.category),
    priceLabel: formatBRL(p.price_cents),
    active: p.is_active,
  }));

  const newButton = (
    <Link href={`${base}/novo`} className={buttonVariants({ variant: "luxe", size: "lg", className: "w-full sm:w-auto" })}>
      <Plus />
      Novo produto
    </Link>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Catálogo"
        title="Produtos"
        description="O que a unidade vende no caixa, com preço."
        action={products.length ? newButton : undefined}
      />

      {aviso === "criado" ? <FlashNotice title="Produto cadastrado">Ele já pode ser vendido na comanda.</FlashNotice> : null}

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Monte o catálogo da unidade"
          description="Cadastre pomadas, óleos e o que a recepção vende. O preço entra direto na comanda."
          action={newButton}
        >
          <div className="mt-9 flex w-full max-w-xl flex-col items-center gap-3 border-t border-border pt-6">
            <span className="label-caps text-[0.65rem]">Categorias disponíveis</span>
            <ul className="flex flex-wrap justify-center gap-2">
              {PRODUCT_CATEGORIES.map((c) => (
                <li
                  key={c.value}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-black/20 px-3.5 py-1.5 text-sm text-muted-foreground"
                >
                  <ProductIcon category={c.value} className="size-3.5 text-gold" />
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        </EmptyState>
      ) : (
        <ProductList slug={slug} products={items} />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { PageHeader } from "@/components/unit/page-header";
import { ProductList, type ProductListItem } from "@/components/unit/product-list";
import { buttonVariants } from "@/components/ui/button";
import { LuxeFrame } from "@/components/ui/luxe-frame";
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
        <LuxeFrame
          className="reveal"
          style={{ "--d": "150ms" } as React.CSSProperties}
          contentClassName="flex flex-col items-center px-6 py-12 text-center sm:py-14"
        >
          <span className="relative flex size-16 items-center justify-center rounded-full border border-gold/40 bg-[#101010] text-gold shadow-[0_0_32px_rgb(192_160_98/0.2)]">
            <Package className="size-7" aria-hidden="true" />
          </span>
          <p className="mt-6 font-heading text-xl uppercase tracking-wide">Monte o catálogo da unidade</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Cadastre pomadas, óleos e o que a recepção vende. O preço entra direto na comanda.
          </p>
          <div className="mt-6 w-full sm:w-auto">{newButton}</div>

          <div className="mt-9 flex w-full max-w-xl flex-col items-center gap-3 border-t border-border pt-6">
            <span className="label-caps text-[0.65rem]">Categorias disponíveis</span>
            <ul className="flex flex-wrap justify-center gap-2">
              {PRODUCT_CATEGORIES.map((c) => (
                <li key={c.value} className="inline-flex items-center gap-2 rounded-full border border-border bg-black/20 px-3.5 py-1.5 text-sm text-muted-foreground">
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        </LuxeFrame>
      ) : (
        <ProductList slug={slug} products={items} />
      )}
    </div>
  );
}

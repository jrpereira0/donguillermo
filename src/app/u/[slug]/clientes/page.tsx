import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, SearchX, UsersRound } from "lucide-react";
import { CustomerList, type CustomerListItem } from "@/components/unit/customer-list";
import { CustomerSearch } from "@/components/unit/customer-search";
import { EmptyState } from "@/components/unit/empty-state";
import { PageHeader } from "@/components/unit/page-header";
import { buttonVariants } from "@/components/ui/button";
import { FlashNotice } from "@/components/ui/notice";
import { requireUnitArea } from "@/lib/auth/guards";
import { CUSTOMERS_PAGE_SIZE, listCustomers, listNetworkUnitNames } from "@/lib/customers/queries";
import { customerPhotoUrl } from "@/lib/customers/photo";

export const metadata: Metadata = { title: "Clientes" };
export const instant = false;

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function ClientesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; page?: string; aviso?: string }>;
}) {
  const { slug } = await params;
  const { q = "", page: pageParam, aviso } = await searchParams;
  await requireUnitArea(slug, "clientes"); // cada página valida o acesso: o layout não re-executa na navegação

  const query = typeof q === "string" ? q.trim().slice(0, 60) : "";
  const page = Math.max(1, Math.min(10_000, Number.parseInt(pageParam ?? "1", 10) || 1));
  const [{ rows, total }, units] = await Promise.all([listCustomers({ q: query, page }), listNetworkUnitNames()]);
  const base = `/u/${slug}/clientes`;
  const pages = Math.max(1, Math.ceil(total / CUSTOMERS_PAGE_SIZE));
  const hrefFor = (p: number) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `${base}?${s}` : base;
  };

  const items: CustomerListItem[] = rows.map((c) => ({
    id: c.id,
    name: c.full_name,
    phone: c.phone,
    email: c.email,
    photoUrl: customerPhotoUrl(c.photo_path, c.updated_at),
    originUnit: c.created_unit_id ? (units[c.created_unit_id] ?? null) : null,
    viaSelf: c.registered_via === "autocadastro",
    createdLabel: dateFmt.format(new Date(c.created_at)),
    active: c.is_active,
  }));

  const newButton = (
    <Link href={`${base}/novo`} className={buttonVariants({ variant: "luxe", size: "lg", className: "w-full sm:w-auto" })}>
      <Plus />
      Novo cliente
    </Link>
  );
  const emptyNetwork = total === 0 && !query;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Relacionamento"
        title="Clientes"
        description="Todos os clientes da rede."
        action={emptyNetwork ? undefined : newButton}
      />

      {aviso === "criado" ? <FlashNotice title="Cliente cadastrado">Ele já pode ser encontrado pela busca.</FlashNotice> : null}

      {emptyNetwork ? (
        <EmptyState
          icon={UsersRound}
          title="Cadastre o primeiro cliente"
          description="Com o cadastro, a recepção agenda mais rápido e acompanha o histórico de atendimentos em todas as unidades."
          action={newButton}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <CustomerSearch slug={slug} initial={query} />

          {items.length === 0 ? (
            <EmptyState
              size="section"
              icon={SearchX}
              title="Nenhum cliente encontrado"
              description={query ? "Confira o que foi digitado na busca." : "Esta página não tem clientes."}
              action={
                query ? (
                  <Link href={base} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Limpar busca
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <CustomerList slug={slug} customers={items} />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {total} {total === 1 ? "cliente" : "clientes"}
              {query ? (total === 1 ? " encontrado" : " encontrados") : " na rede"}
            </p>
            {pages > 1 ? (
              <nav className="flex items-center gap-2" aria-label="Páginas">
                {page > 1 ? (
                  <Link href={hrefFor(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <ChevronLeft />
                    Anterior
                  </Link>
                ) : null}
                <span className="px-2 text-xs text-muted-foreground">
                  Página {page} de {pages}
                </span>
                {page < pages ? (
                  <Link href={hrefFor(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Próxima
                    <ChevronRight />
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

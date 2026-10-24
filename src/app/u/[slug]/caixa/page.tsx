import type { Metadata } from "next";
import Link from "next/link";
import { CashDesk } from "@/components/caixa/cash-desk";
import { CashHistoryPanel } from "@/components/caixa/cash-history";
import { PageHeader } from "@/components/unit/page-header";
import { requireUnitArea } from "@/lib/auth/guards";
import {
  getOpenRegister,
  listCatalog,
  listClosedRegisters,
  listOpenTickets,
  listRegisterMovements,
  listRegisterPayments,
  listRegisterTickets,
} from "@/lib/caixa/queries";
import type { MethodTotals } from "@/lib/caixa/types";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Caixa" };
export const instant = false;

const emptyMethods = (): MethodTotals => ({ dinheiro: 0, pix: 0, debito: 0, credito: 0 });

export default async function CaixaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { slug } = await params;
  const { aba } = await searchParams;
  const { unit } = await requireUnitArea(slug, "caixa");
  const [register, openTickets, catalog] = await Promise.all([
    getOpenRegister(unit.id),
    listOpenTickets(unit.id),
    listCatalog(unit.id),
  ]);
  const [methods, movements, paidTickets] = register
    ? await Promise.all([
        listRegisterPayments(register.id),
        listRegisterMovements(register.id),
        listRegisterTickets(register.id),
      ])
    : [emptyMethods(), [], []];

  // Sem caixa aberto, a página já é o histórico. Com caixa aberto, o histórico vira uma aba.
  const showHistory = !register || aba === "historico";
  const history = showHistory ? await listClosedRegisters(unit.id) : [];

  const tabs = register ? (
    <nav aria-label="Seções do caixa" className="flex flex-wrap gap-2">
      {[
        { key: "dia", label: "Caixa do dia", href: `/u/${slug}/caixa`, active: !showHistory },
        { key: "historico", label: "Histórico", href: `/u/${slug}/caixa?aba=historico`, active: showHistory },
      ].map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "label-caps rounded-full border px-4 py-2 text-[0.65rem] transition-colors",
            t.active
              ? "border-gold/60 bg-gold/15 text-gold"
              : "border-border bg-black/30 text-muted-foreground hover:border-gold/40 hover:text-gold",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Caixa"
        description={
          register
            ? showHistory
              ? "Fechamentos anteriores desta unidade."
              : `Aberto por ${register.openedByName ?? "recepção"}.`
            : "Abra o caixa para receber as comandas."
        }
      />
      {tabs}
      {register && showHistory ? (
        <CashHistoryPanel slug={slug} history={history} />
      ) : (
        <CashDesk
          slug={slug}
          register={register}
          methods={methods}
          movements={movements}
          openTickets={openTickets}
          paidTickets={paidTickets}
          barbers={catalog.barbers}
          history={history}
        />
      )}
    </div>
  );
}

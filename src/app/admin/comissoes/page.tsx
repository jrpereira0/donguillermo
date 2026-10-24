import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Percent, ShoppingBag, Users } from "lucide-react";
import { BarberOverridesForm } from "@/components/admin/barber-overrides-form";
import { CommissionBracketsForm } from "@/components/admin/commission-brackets-form";
import { NetworkProductsForm } from "@/components/admin/network-products-form";
import { requireNetworkAdmin } from "@/lib/auth/guards";
import { listBarbersCommissionAdmin } from "@/lib/commissions/admin";
import { getNetworkProductsPct, listCommissionBrackets } from "@/lib/commissions/queries";

export const metadata: Metadata = { title: "Comissões da rede" };
export const instant = false;

export default async function AdminComissoesPage() {
  await requireNetworkAdmin();
  const [brackets, productsPct, barbers] = await Promise.all([
    listCommissionBrackets(),
    getNetworkProductsPct(),
    listBarbersCommissionAdmin(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Painel da rede
      </Link>

      <div>
        <p className="label-caps">Rede · Financeiro</p>
        <h1 className="mt-1 font-heading text-3xl font-semibold uppercase tracking-wide">Comissões</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Comissão de serviços e produtos de todas as unidades.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold uppercase tracking-wide">
          <Percent className="size-4 text-gold" aria-hidden="true" />
          Serviços · faixas de faturamento mensal
        </h2>
        <div className="mt-4">
          <CommissionBracketsForm initial={brackets} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold uppercase tracking-wide">
          <ShoppingBag className="size-4 text-gold" aria-hidden="true" />
          Produtos · percentual da rede
        </h2>
        <div className="mt-4">
          <NetworkProductsForm initialPct={productsPct} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold uppercase tracking-wide">
          <Users className="size-4 text-gold" aria-hidden="true" />
          Por profissional
        </h2>
        <div className="mt-4">
          <BarberOverridesForm initial={barbers} />
        </div>
      </section>
    </div>
  );
}

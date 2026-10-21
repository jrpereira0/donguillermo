import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Percent } from "lucide-react";
import { CommissionBracketsForm } from "@/components/admin/commission-brackets-form";
import { requireNetworkAdmin } from "@/lib/auth/guards";
import { listCommissionBrackets } from "@/lib/commissions/queries";

export const metadata: Metadata = { title: "Tabela de comissões" };
export const instant = false;

export default async function AdminComissoesPage() {
  await requireNetworkAdmin();
  const brackets = await listCommissionBrackets();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin" className="link-luxe label-caps inline-flex w-fit items-center gap-2 py-1">
        <ArrowLeft className="size-3.5" />
        Painel da rede
      </Link>

      <div>
        <p className="label-caps">Rede · Financeiro</p>
        <h1 className="mt-1 font-heading text-3xl font-semibold uppercase tracking-wide">Tabela de comissões</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Comissão de <strong className="font-medium text-cream">serviços</strong> dos profissionais-parceiros: o
          percentual é o da faixa em que cai o faturamento de serviços de cada um <strong className="font-medium text-cream">no mês</strong>,
          aplicado sobre todo o faturamento daquele mês (faixa única). Vale para todas as unidades. Produtos ficam
          fora da tabela: cada profissional tem o percentual dele no cadastro.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold uppercase tracking-wide">
          <Percent className="size-4 text-gold" aria-hidden="true" />
          Faixas de faturamento mensal (serviços)
        </h2>
        <div className="mt-4">
          <CommissionBracketsForm initial={brackets} />
        </div>
      </section>
    </div>
  );
}

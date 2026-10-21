import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { ChevronRight, Percent, type LucideIcon } from "lucide-react";
import { CommissionFilter } from "@/components/caixa/commission-filter";
import { BarberAvatar } from "@/components/unit/barber-avatar";
import { PageHeader } from "@/components/unit/page-header";
import { requireUnitArea } from "@/lib/auth/guards";
import { listCommissionSummary } from "@/lib/commissions/queries";
import { periodLabel, resolvePeriod } from "@/lib/commissions/period";
import { formatBRL } from "@/lib/validation/service";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Comissões" };
export const instant = false;

function Panel({
  icon: Icon,
  title,
  right,
  children,
  gold,
}: {
  icon: LucideIcon;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  gold?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]",
        gold ? "border-gold/30" : "border-border",
      )}
    >
      <header className="flex items-center gap-3 border-b border-border/80 bg-black/20 px-4 py-3 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h2 className="min-w-0 flex-1 font-heading text-base font-semibold uppercase tracking-wide text-cream">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: "gold" | "cream" }) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-b from-[#262626]/85 to-[#161616]/90 px-4 py-4 shadow-[inset_0_1px_0_rgb(242_237_228/0.06)]">
      <p className="label-caps text-[0.62rem]">{label}</p>
      <p className={cn("mt-1.5 font-heading text-[1.55rem] font-semibold leading-none tabular-nums", accent === "gold" ? "text-gold" : "text-cream")}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[0.7rem] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const fmtPct = (n: number) => `${String(n).replace(".", ",")}%`;

export default async function ComissoesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  await connection();
  const { slug } = await params;
  const period = resolvePeriod(await searchParams);
  const { unit } = await requireUnitArea(slug, "comissoes");
  const rows = await listCommissionSummary(unit.id, period.fromISO, period.toISO);

  const producao = rows.reduce((a, r) => a + r.productionCents, 0);
  const comissoes = rows.reduce((a, r) => a + r.commissionCents, 0);
  const gorjetas = rows.reduce((a, r) => a + r.tipsCents, 0);
  const atendimentos = rows.reduce((a, r) => a + r.appointmentsDone, 0);
  const comMovimento = rows.filter((r) => r.productionCents > 0 || r.tipsCents > 0).length;
  const qs = `?de=${period.de}&ate=${period.ate}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Comissões"
        description={`Produção, comissões e gorjetas dos barbeiros pelas comandas fechadas de ${periodLabel(period.de, period.ate)}. A comissão de serviços segue a tabela progressiva da rede (o % é o da faixa do faturamento de serviços dele em cada mês); produtos têm o % do cadastro e a gorjeta é integral dele.`}
      />

      <CommissionFilter basePath={`/u/${slug}/comissoes`} de={period.de} ate={period.ate} today={period.today} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Produção no período" value={formatBRL(producao)} hint="Serviços e produtos nas comandas fechadas" accent="gold" />
        <Kpi label="Comissões a pagar" value={formatBRL(comissoes)} hint={`${comMovimento} ${comMovimento === 1 ? "barbeiro" : "barbeiros"} com movimento`} />
        <Kpi label="Gorjetas" value={formatBRL(gorjetas)} hint="Integrais dos barbeiros, já incluídas no total a receber" />
        <Kpi label="Atendimentos concluídos" value={String(atendimentos)} hint="Agendamentos concluídos na agenda no período" />
      </section>

      <Panel
        icon={Percent}
        title="Barbeiros"
        right={
          <span className="label-caps shrink-0 text-[0.62rem]">
            {rows.length} {rows.length === 1 ? "barbeiro" : "barbeiros"} · a receber {formatBRL(comissoes + gorjetas)}
          </span>
        }
      >
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhum barbeiro cadastrado. Cadastre em Profissionais para começar.
          </p>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.5fr)_7rem_8.5rem_9rem_8rem_9rem_1.5rem] items-center gap-3 border-b border-border/60 px-5 py-2 lg:grid">
              {["Barbeiro", "Atend.", "Produção", "Comissão", "Gorjetas", "A receber", ""].map((h, i) => (
                <span key={i} className={cn("label-caps text-[0.58rem]", i > 0 && i < 6 && "text-right")}>
                  {h}
                </span>
              ))}
            </div>
            <ul className="divide-y divide-border/70">
              {rows.map((r) => (
                <li key={r.barberId}>
                  <Link
                    href={`/u/${slug}/comissoes/${r.barberId}${qs}`}
                    className="group grid items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gold/[0.05] sm:px-5 lg:grid-cols-[minmax(0,1.5fr)_7rem_8.5rem_9rem_8rem_9rem_1.5rem]"
                  >
                    <span className={cn("flex min-w-0 items-center gap-3", !r.isActive && "opacity-55")}>
                      <BarberAvatar name={r.name} url={null} className="size-10 text-sm" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 truncate text-sm font-medium text-cream">
                          {r.name}
                          {!r.isActive ? (
                            <span className="label-caps shrink-0 rounded-full border border-border bg-black/30 px-2 py-0.5 text-[0.55rem] text-muted-foreground">
                              Inativo
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {r.jobTitle} · {fmtPct(r.pctServices)} serviços (tabela) · {fmtPct(r.pctProducts)} produtos
                        </span>
                      </span>
                    </span>
                    <span className="hidden text-right tabular-nums text-muted-foreground lg:block">{r.appointmentsDone}</span>
                    <span className="hidden text-right tabular-nums text-cream lg:block">{formatBRL(r.productionCents)}</span>
                    <span className="hidden text-right tabular-nums text-cream lg:block">{formatBRL(r.commissionCents)}</span>
                    <span className="hidden text-right tabular-nums text-gold/90 lg:block">{formatBRL(r.tipsCents)}</span>
                    <span className="flex items-center justify-between gap-2 lg:justify-end">
                      <span className="font-heading text-lg font-semibold tabular-nums text-gold">{formatBRL(r.totalCents)}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold lg:hidden" aria-hidden="true" />
                    </span>
                    <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold lg:block" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Toque em um barbeiro para ver as comandas, os itens mais vendidos e o cálculo completo dele no período. O
        percentual de serviços vem da tabela progressiva da rede (faixa pelo faturamento de serviços de cada mês) e o
        de produtos, do cadastro do profissional.
      </p>
    </div>
  );
}

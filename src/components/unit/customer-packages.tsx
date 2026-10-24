import Link from "next/link";
import { ArrowRight, Layers, ReceiptText } from "lucide-react";
import { startCustomerTicketAction } from "@/app/u/[slug]/pacotes/actions";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import type { CustomerPackage, PackageUseEntry } from "@/lib/packages/types";
import { formatBRL } from "@/lib/validation/service";
import { CancelPackageButton } from "./cancel-package-button";
import { EmptyState } from "./empty-state";
import { FormSection } from "./form-parts";
import { PackageStatusChip } from "./package-status";
import { SellPackageForm } from "./sell-package-form";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const fmtPct = (n: number) => `${String(n).replace(".", ",")}%`;

export type SellOption = { id: string; name: string; priceCents: number; totalServices: number; discountPct: number };

function PackageCard({ slug, customerId, cp }: { slug: string; customerId: string; cp: CustomerPackage }) {
  const canUse = cp.status === "ativa" && cp.remainingServices > 0;
  const canCancel = (cp.status === "pendente" || cp.status === "ativa") && cp.usedServices === 0;
  return (
    <li className="rounded-xl border border-border bg-black/20 px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 truncate font-heading text-base font-semibold uppercase tracking-wide text-cream">
          {cp.packageName}
        </p>
        <PackageStatusChip status={cp.status} />
      </div>

      <ul className="mt-3 flex flex-col gap-2.5">
        {cp.items.map((i) => {
          const remaining = Math.max(0, i.quantityTotal - i.used);
          const pctUsed = i.quantityTotal ? Math.round((Math.min(i.used, i.quantityTotal) / i.quantityTotal) * 100) : 0;
          return (
            <li key={`${cp.id}-${i.serviceName}`} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-cream">{i.serviceName}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {cp.status === "pendente" ? (
                    <>aguardando pagamento</>
                  ) : remaining > 0 ? (
                    <>
                      restam <strong className="font-semibold text-gold">{remaining}</strong> de {i.quantityTotal}
                    </>
                  ) : (
                    <>usou os {i.quantityTotal}</>
                  )}
                </span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-black/60" role="progressbar" aria-valuenow={pctUsed} aria-valuemin={0} aria-valuemax={100} aria-label={`Uso de ${i.serviceName}`}>
                <span className="block h-full rounded-full bg-gold/80 transition-all" style={{ width: `${pctUsed}%` }} />
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Pago {formatBRL(cp.priceCents)}
        {cp.discountPct > 0 ? ` (de ${formatBRL(cp.listCents)}, −${fmtPct(cp.discountPct)})` : ""} · comprado em{" "}
        {dateFmt.format(new Date(cp.soldAt))}
        {cp.status === "pendente"
          ? " · ativa quando a comanda da venda for cobrada"
          : cp.expiresAt
            ? ` · vale até ${dateFmt.format(new Date(cp.expiresAt))}`
            : " · sem validade"}
      </p>

      {canUse || cp.status === "pendente" || canCancel ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          {canUse ? (
            <form action={startCustomerTicketAction.bind(null, slug, customerId)}>
              <Button type="submit" variant="luxe" size="sm">
                Usar na comanda
                <ArrowRight />
              </Button>
            </form>
          ) : null}
          {cp.status === "pendente" && cp.soldTicketId ? (
            <Link href={`/u/${slug}/caixa/comanda/${cp.soldTicketId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Continuar a venda
            </Link>
          ) : null}
          {canCancel ? <CancelPackageButton slug={slug} customerPackageId={cp.id} /> : null}
        </div>
      ) : null}
    </li>
  );
}

/** Aba Pacotes da ficha: vender, saldo por serviço e histórico de uso deste cliente (nesta unidade). */
export function CustomerPackages({
  slug,
  customerId,
  packages,
  sellOptions,
  uses,
}: {
  slug: string;
  customerId: string;
  packages: CustomerPackage[];
  sellOptions: SellOption[];
  uses: PackageUseEntry[];
}) {
  return (
    <>
      <FormSection icon={Layers} title="Pacotes do cliente" description="Saldo nesta unidade. Ao usar, o serviço entra na comanda pelo pacote e não é cobrado de novo.">
        <div className="flex flex-col gap-5">
          {sellOptions.length ? (
            <SellPackageForm
              slug={slug}
              customerId={customerId}
              options={sellOptions.map((o) => ({
                value: o.id,
                label: `${o.name} · ${formatBRL(o.priceCents)} (${o.totalServices} ${o.totalServices === 1 ? "serviço" : "serviços"}${o.discountPct > 0 ? `, −${fmtPct(o.discountPct)}` : ""})`,
              }))}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              Nenhum pacote ativo para vender. Cadastre em <strong className="font-medium text-cream">Pacotes</strong>, no menu
              Catálogo.
            </p>
          )}

          {packages.length === 0 ? (
            <EmptyState
              size="section"
              icon={Layers}
              title="Nenhum pacote por aqui"
              description="Quando vender um pacote para este cliente, o saldo de cada serviço aparece aqui."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {packages.map((cp) => (
                <PackageCard key={cp.id} slug={slug} customerId={customerId} cp={cp} />
              ))}
            </ul>
          )}
        </div>
      </FormSection>

      {uses.length ? (
        <FormSection icon={ReceiptText} title="Uso dos pacotes" description="Serviços já baixados do saldo, do mais recente para o mais antigo.">
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
            {uses.map((u, i) => (
              <li key={`${u.ticketId}-${u.serviceName}-${i}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-cream">
                    {u.quantity > 1 ? `${u.quantity}× ` : ""}
                    {u.serviceName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {u.packageName}
                    {u.barberName ? ` · ${u.barberName}` : ""} · {dateTimeFmt.format(new Date(u.whenAt))}
                    {u.ticketStatus === "aberta" ? " · comanda aberta" : ""}
                  </span>
                </span>
                <Link href={`/u/${slug}/caixa/comanda/${u.ticketId}`} className="label-caps text-[0.62rem] text-gold hover:underline">
                  Comanda
                </Link>
              </li>
            ))}
          </ul>
        </FormSection>
      ) : null}
    </>
  );
}

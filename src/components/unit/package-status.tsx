import type { CustomerPackageStatus } from "@/lib/packages/types";
import { cn } from "@/lib/utils";

export const PACKAGE_STATUS: Record<CustomerPackageStatus, { label: string; className: string }> = {
  pendente: { label: "Aguardando pagamento", className: "border-amber-300/40 bg-amber-300/10 text-amber-200" },
  ativa: { label: "Ativo", className: "border-emerald-300/40 bg-emerald-300/10 text-emerald-200" },
  esgotada: { label: "Esgotado", className: "border-border bg-black/30 text-muted-foreground" },
  expirada: { label: "Vencido", className: "border-rose-300/40 bg-rose-300/10 text-rose-200" },
  cancelada: { label: "Cancelado", className: "border-border bg-black/30 text-muted-foreground/70" },
};

export function PackageStatusChip({ status, className }: { status: CustomerPackageStatus; className?: string }) {
  const meta = PACKAGE_STATUS[status];
  return (
    <span
      className={cn(
        "label-caps inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.58rem]",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

import type { CustomerPackageStatus } from "@/lib/packages/types";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";

const PACKAGE_STATUS: Record<CustomerPackageStatus, { label: string; tone: StatusTone }> = {
  pendente: { label: "Aguardando pagamento", tone: "gold" },
  ativa: { label: "Ativo", tone: "success" },
  esgotada: { label: "Esgotado", tone: "muted" },
  expirada: { label: "Vencido", tone: "danger" },
  cancelada: { label: "Cancelado", tone: "muted" },
};

export function PackageStatusChip({ status, className }: { status: CustomerPackageStatus; className?: string }) {
  const meta = PACKAGE_STATUS[status];
  return (
    <StatusPill tone={meta.tone} className={className}>
      {meta.label}
    </StatusPill>
  );
}

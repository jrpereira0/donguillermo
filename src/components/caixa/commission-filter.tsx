"use client";

import { useRouter } from "next/navigation";
import { PeriodFilter, type PeriodPreset } from "@/components/ui/period-filter";
import { addDays } from "@/lib/agenda/time";

/** Filtro de período das comissões — barra padrão do sistema (ver PeriodFilter). */
export function CommissionFilter({
  basePath,
  de,
  ate,
  today,
}: {
  basePath: string;
  de: string;
  ate: string;
  today: string;
}) {
  const router = useRouter();
  const monthStart = `${today.slice(0, 8)}01`;

  const presets: PeriodPreset[] = [
    { label: "Hoje", from: today, to: today },
    { label: "Ontem", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "7 dias", from: addDays(today, -6), to: today },
    { label: "Este mês", from: monthStart, to: today },
    { label: "30 dias", from: addDays(today, -29), to: today },
  ];

  return (
    <PeriodFilter
      value={{ from: de, to: ate }}
      today={today}
      presets={presets}
      onApply={(v) => router.push(`${basePath}?de=${v.from}&ate=${v.to}`, { scroll: false })}
    />
  );
}

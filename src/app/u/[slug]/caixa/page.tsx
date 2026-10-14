import type { Metadata } from "next";
import { ComingSoon } from "@/components/unit/coming-soon";
import { requireUnitArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Caixa" };
export const instant = false;

export default async function CaixaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireUnitArea(slug, "caixa"); // cada página valida o acesso: o layout não re-executa na navegação

  return <ComingSoon eyebrow="Financeiro" title="Caixa" />;
}

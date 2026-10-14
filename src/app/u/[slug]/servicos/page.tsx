import type { Metadata } from "next";
import { ComingSoon } from "@/components/unit/coming-soon";
import { requireUnitArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Serviços" };
export const instant = false;

export default async function ServiosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireUnitArea(slug, "servicos"); // cada página valida o acesso: o layout não re-executa na navegação

  return <ComingSoon eyebrow="Catálogo" title="Serviços" />;
}

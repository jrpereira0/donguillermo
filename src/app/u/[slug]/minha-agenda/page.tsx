import type { Metadata } from "next";
import { ComingSoon } from "@/components/unit/coming-soon";
import { requireUnitArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Minha agenda" };
export const instant = false;

export default async function MinhaagendaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireUnitArea(slug, "minha-agenda"); // cada página valida o acesso: o layout não re-executa na navegação

  return <ComingSoon eyebrow="Barbeiro" title="Minha agenda" />;
}

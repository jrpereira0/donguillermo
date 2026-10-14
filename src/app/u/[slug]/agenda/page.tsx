import type { Metadata } from "next";
import { ComingSoon } from "@/components/unit/coming-soon";
import { requireUnitArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Agenda" };
export const instant = false;

export default async function AgendaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireUnitArea(slug, "agenda"); // cada página valida o acesso: o layout não re-executa na navegação

  return <ComingSoon eyebrow="Recepção" title="Agenda" />;
}

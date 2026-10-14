import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUnitArea } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Agenda" };
export const instant = false;

export default async function AgendaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { unit } = await requireUnitArea(slug, "agenda"); // só recepção (ou admin) desta unidade

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Agenda</h1>
      <Card>
        <CardHeader>
          <p className="label-caps">{unit.name}</p>
          <CardTitle className="font-heading text-xl uppercase tracking-wide">
            Agenda da recepção
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Em construção (fase de agenda).
        </CardContent>
      </Card>
    </div>
  );
}

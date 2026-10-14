import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireNetworkAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Painel da rede" };
export const instant = false;

export default async function AdminHome() {
  await requireNetworkAdmin(); // layouts não rodam de novo na navegação: valida na página também
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Painel da rede</h1>
      <Card>
        <CardHeader>
          <p className="label-caps">Etapa 5</p>
          <CardTitle className="font-heading text-xl uppercase tracking-wide">
            Cadastro de unidades
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Em construção.
        </CardContent>
      </Card>
    </div>
  );
}

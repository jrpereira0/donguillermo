import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listUnits, receptionOf } from "@/lib/admin/units";
import { requireNetworkAdmin } from "@/lib/auth/guards";
import { toggleUnitActiveAction } from "./actions";

export const metadata: Metadata = { title: "Painel da rede" };
export const instant = false;

export default async function AdminHome() {
  await requireNetworkAdmin(); // layouts não rodam de novo na navegação: valida na página também
  const units = await listUnits();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Painel da rede</p>
          <h1 className="text-3xl">Unidades</h1>
        </div>
        <Link href="/admin/unidades/nova" className={buttonVariants({ size: "lg" })}>
          <Plus /> Nova unidade
        </Link>
      </div>

      {units.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma unidade cadastrada ainda.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {units.map((unit) => {
            const reception = receptionOf(unit);
            const activeReception = reception.filter((m) => m.is_active);
            return (
              <li key={unit.id}>
                <Card className={unit.is_active ? undefined : "opacity-75"}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="font-heading text-xl uppercase tracking-wide">
                        {unit.name}
                      </CardTitle>
                      <Badge variant={unit.is_active ? "default" : "outline"}>
                        {unit.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">/u/{unit.slug}</p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <dl className="grid gap-1 text-sm">
                      {unit.address ? (
                        <div>
                          <dt className="sr-only">Endereço</dt>
                          <dd>{unit.address}</dd>
                        </div>
                      ) : null}
                      <div className="text-muted-foreground">
                        <dt className="inline">Recepção: </dt>
                        <dd className="inline">
                          {reception.length === 0
                            ? "sem recepção"
                            : activeReception.map((m) => m.profiles?.email ?? "—").join(", ") ||
                              "todas desativadas"}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/unidades/${unit.slug}`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Gerenciar
                      </Link>
                      <form action={toggleUnitActiveAction.bind(null, unit.id, !unit.is_active)}>
                        <Button type="submit" variant="ghost" size="sm">
                          {unit.is_active ? "Desativar" : "Reativar"}
                        </Button>
                      </form>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

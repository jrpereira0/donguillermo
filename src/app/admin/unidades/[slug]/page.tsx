import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteReceptionForm } from "@/components/admin/invite-reception-form";
import { ReceptionPasswordForm } from "@/components/admin/reception-password-form";
import { UnitForm } from "@/components/admin/unit-form";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUnitBySlug, receptionOf } from "@/lib/admin/units";
import { requireNetworkAdmin } from "@/lib/auth/guards";
import { slugSchema } from "@/lib/validation/unit";
import { toggleMemberActiveAction, toggleUnitActiveAction } from "../../actions";

export const metadata: Metadata = { title: "Gerenciar unidade" };
export const instant = false;

export default async function ManageUnitPage({ params }: PageProps<"/admin/unidades/[slug]">) {
  await requireNetworkAdmin();
  const { slug } = await params;
  if (!slugSchema.safeParse(slug).success) notFound();

  const unit = await getUnitBySlug(slug);
  if (!unit) notFound();
  const reception = receptionOf(unit);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link href="/admin" className="label-caps hover:text-foreground">
          ← Unidades
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl">{unit.name}</h1>
          <Badge variant={unit.is_active ? "default" : "outline"}>
            {unit.is_active ? "Ativa" : "Inativa"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/u/${unit.slug}/agenda`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Abrir área da recepção
          </Link>
          <form action={toggleUnitActiveAction.bind(null, unit.id, !unit.is_active)}>
            <Button type="submit" variant="ghost" size="sm">
              {unit.is_active ? "Desativar unidade" : "Reativar unidade"}
            </Button>
          </form>
        </div>
        {!unit.is_active ? (
          <p className="text-sm text-muted-foreground">
            Unidade inativa: a recepção e os barbeiros não conseguem entrar nela.
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl uppercase tracking-wide">Dados</CardTitle>
        </CardHeader>
        <CardContent>
          <UnitForm mode="edit" unit={unit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl uppercase tracking-wide">Recepção</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {reception.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém com acesso ainda.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {reception.map((m) => (
                <li key={m.id} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{m.profiles?.full_name || "Sem nome"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.profiles?.email ?? "—"}
                      </p>
                    </div>
                    <Badge variant={m.is_active ? "default" : "outline"}>
                      {m.is_active ? "Ativa" : "Desativada"}
                    </Badge>
                  </div>
                  <ReceptionPasswordForm memberId={m.id} />
                  <form action={toggleMemberActiveAction.bind(null, m.id, !m.is_active)}>
                    <Button type="submit" variant="ghost" size="sm">
                      {m.is_active ? "Remover acesso desta unidade" : "Reativar acesso"}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border pt-6">
            <h2 className="label-caps mb-4 font-label text-xs">Adicionar recepção</h2>
            <InviteReceptionForm unitId={unit.id} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

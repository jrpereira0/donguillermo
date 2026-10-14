import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Página provisória (Etapa 3): confirma que o login funcionou.
 * Na Etapa 4 esta rota passa a redirecionar cada usuário para a sua área.
 */
async function SessionPanel() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <Card>
      <CardHeader>
        <p className="label-caps">Sessão ativa</p>
        <CardTitle className="font-heading text-xl uppercase tracking-wide">
          Login realizado
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Conta</span>
          <Badge>{data.user.email}</Badge>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="lg" className="w-full">
            Sair
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-12">
      <header className="flex justify-center">
        <BrandMark />
      </header>
      <Suspense
        fallback={<p className="label-caps text-center">Carregando…</p>}
      >
        <SessionPanel />
      </Suspense>
    </main>
  );
}

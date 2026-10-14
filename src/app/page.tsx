import { Suspense } from "react";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { brand } from "@/config/brand";
import { checkSupabase, type SupabaseStatus } from "@/lib/supabase/health";

const statusText: Record<SupabaseStatus["state"], string> = {
  connected: "Conectado",
  not_configured: "Não configurado",
  invalid_key: "Chave recusada",
  unreachable: "Sem conexão",
};

function SupabaseCardShell({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <p className="label-caps">Fundação · Etapa 1</p>
        <CardTitle className="font-heading text-xl uppercase tracking-wide">
          Conexão com o Supabase
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

async function SupabaseStatusCard() {
  await connection(); // sempre em tempo de requisição
  const status = await checkSupabase();
  const ok = status.state === "connected";

  return (
    <SupabaseCardShell>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Status</span>
        <Badge variant={ok ? "default" : "destructive"}>
          {statusText[status.state]}
        </Badge>
      </div>

      {status.state === "connected" && (
        <p className="text-sm text-muted-foreground">
          Resposta em {status.latencyMs} ms. Projeto e anon key válidos.
        </p>
      )}

      {status.state === "not_configured" && (
        <div className="text-sm text-muted-foreground">
          <p className="mb-2">
            Preencha o arquivo <code className="text-cream">.env.local</code> e
            reinicie o <code className="text-cream">npm run dev</code>:
          </p>
          <ul className="list-disc pl-5">
            {status.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      {(status.state === "invalid_key" || status.state === "unreachable") && (
        <p className="text-sm text-muted-foreground">{status.message}</p>
      )}
    </SupabaseCardShell>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-4xl leading-tight">{brand.name}</h1>
        <p className="label-caps mt-2 text-gold">
          {brand.tagline} · Sistema de gestão
        </p>
      </header>

      <Suspense
        fallback={
          <SupabaseCardShell>
            <p className="text-sm text-muted-foreground">
              Verificando conexão…
            </p>
          </SupabaseCardShell>
        }
      >
        <SupabaseStatusCard />
      </Suspense>

      <section className="grid gap-4">
        <p className="label-caps">Amostra do tema</p>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="label-caps">Comissão do mês</p>
            <p className="display-number text-6xl">R$ 5.780</p>
            <p className="font-heading text-3xl font-bold text-gold">
              R$ 1.445
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

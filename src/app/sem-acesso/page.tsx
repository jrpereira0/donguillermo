import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { requireAuth } from "@/lib/auth/guards";
import { resolveHome } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Sem acesso" };
export const instant = false;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireAuth();
  const params = await searchParams;
  const motivo = Array.isArray(params.motivo) ? params.motivo[0] : params.motivo;
  const home = resolveHome(ctx.memberships);

  // Mensagem genérica: não revela se a unidade existe ou de quem ela é.
  const message =
    motivo === "area"
      ? "Você não tem permissão para acessar esta área."
      : !ctx.active
        ? "Sua conta está inativa. Fale com o administrador da rede."
        : "Sua conta ainda não está vinculada a nenhuma unidade. Fale com o administrador da rede.";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-12">
      <header className="flex justify-center">
        <BrandMark />
      </header>
      <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl">Sem acesso</h1>
          <p className="text-sm text-muted-foreground">Conta: {ctx.email}</p>
        </div>
        <FormAlert tone="error">{message}</FormAlert>

        {home.kind !== "none" ? (
          <Link href="/" className={buttonVariants({ size: "lg" })}>
            Ir para a minha área
          </Link>
        ) : null}

        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="lg" className="w-full">
            Sair
          </Button>
        </form>
      </div>
    </main>
  );
}

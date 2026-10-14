import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { ROLE_LABEL, type AppRole } from "@/lib/auth/roles";

type Props = {
  email: string;
  role: AppRole;
  /** Unidade atual (ou "Rede" para o painel admin). */
  scope: string;
  children: React.ReactNode;
};

/** Moldura das áreas autenticadas: marca, onde estou, quem sou e botão Sair. */
export function AppShell({ email, role, scope, children }: Props) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-5">
            <BrandMark size="md" />
            <div className="hidden border-l border-border pl-5 sm:block">
              <p className="label-caps">{ROLE_LABEL[role]}</p>
              <p className="font-heading text-lg font-semibold uppercase tracking-wide">
                {scope}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground md:inline">
              {email}
            </span>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm">
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}

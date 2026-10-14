import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { requireAuth } from "@/lib/auth/guards";
import { destinationsFor, ROLE_LABEL } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Escolher área" };
export const instant = false;

/** Para quem tem mais de um papel ou unidade: escolher onde entrar. */
export default async function ChoosePage() {
  const ctx = await requireAuth();
  const destinations = destinationsFor(ctx.memberships);

  if (destinations.length === 0) redirect("/sem-acesso");
  if (destinations.length === 1) redirect(destinations[0]!.href);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-12">
      <header className="flex justify-center">
        <BrandMark />
      </header>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Onde você quer entrar?</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta ({ctx.email}) tem acesso a mais de uma área.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {destinations.map((d) => (
          <li key={d.href}>
            <Link
              href={d.href}
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-gold focus-visible:border-gold focus-visible:outline-none"
            >
              <p className="label-caps">{ROLE_LABEL[d.role]}</p>
              <p className="font-heading text-xl font-semibold uppercase tracking-wide">
                {d.title}
              </p>
              {d.subtitle ? (
                <p className="text-sm text-muted-foreground">{d.subtitle}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      <form action={signOutAction}>
        <Button type="submit" variant="outline" size="lg" className="w-full">
          Sair
        </Button>
      </form>
    </main>
  );
}

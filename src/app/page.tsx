import { redirect } from "next/navigation";
import { resolveHome } from "@/lib/auth/roles";
import { requireAuth } from "@/lib/auth/guards";

// A decisão depende da sessão: a página bloqueia no servidor para poder
// responder com um redirecionamento de verdade (sem piscar conteúdo).
export const instant = false;

/** Porta de entrada: manda cada usuário para a sua área, decidido no servidor. */
export default async function Home() {
  const ctx = await requireAuth();
  const home = resolveHome(ctx.memberships);

  if (home.kind === "none") redirect("/sem-acesso");
  if (home.kind === "single") redirect(home.href);
  redirect("/entrar");
}

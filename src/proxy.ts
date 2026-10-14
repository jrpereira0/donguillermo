import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16: "middleware" foi renomeado para "proxy".

/** Rotas abertas a quem não está logado. Todo o resto exige sessão. */
const PUBLIC_PATHS = [
  /^\/login$/,
  /^\/esqueci-senha$/,
  /^\/redefinir-senha$/,
  /^\/auth\//,
  /^\/api\/health$/,
];

/**
 * 1ª barreira: renova a sessão e manda para o /login (307) quem não tem sessão.
 * Ela NÃO decide papéis: isso é feito no servidor, em cada layout/página
 * (src/lib/auth/guards.ts) — o proxy nunca é a única proteção.
 */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((re) => re.test(pathname));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + search);

    const redirect = NextResponse.redirect(url);
    // Preserva cookies renovados pelo Supabase.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: [
    // Ignora estáticos, imagens otimizadas e favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

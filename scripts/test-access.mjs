// Teste de ACESSO por papel contra o app rodando (npm run dev) + Supabase real.
//
// Cria usuários e uma unidade temporários, faz login de verdade (cookies de
// sessão idênticos aos do navegador) e confere, para cada rota protegida, o
// status HTTP e o destino do redirecionamento. Limpa tudo no final.
//
// Uso: npm run test:access           (app em http://localhost:3000)
//      APP_URL=http://localhost:3001 npm run test:access
import { createServerClient } from "@supabase/ssr";
import { adminClient, randomPassword, requireEnv, upsertUser } from "./_lib.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = adminClient();
const tag = Date.now().toString(36);
const SLUG_A = "sao-bernardo-metropole";
const SLUG_B = `teste-acesso-${tag}`;
const created = { users: [], units: [] };
let total = 0;
let failures = 0;

function check(name, ok, extra = "") {
  total++;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok    " : "FALHOU"} ${name} ${ok ? "" : extra}`);
}

/** Entra com e-mail/senha e devolve o header Cookie igual ao do navegador. */
async function sessionCookie(email, password) {
  const jar = new Map();
  const supabase = createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
      },
    },
  );
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

/**
 * Requisição sem seguir redirecionamentos. Devolve { status, to }.
 * `to` vem do header Location (redirect HTTP real) ou, se a página já tinha
 * começado a transmitir, da meta-tag de refresh que o Next injeta.
 */
async function hit(path, cookie) {
  const res = await fetch(APP + path, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  let to = res.headers.get("location");
  let kind = to ? "http" : "";
  if (!to && res.status === 200) {
    const html = await res.text();
    const m = html.match(/http-equiv="refresh"[^>]*content="\d+;url=([^"]+)"/);
    if (m) {
      to = m[1];
      kind = "meta";
    }
  }
  if (to) to = to.replace(APP, "");
  return { status: res.status, to, kind };
}

function expectRedirect(name, r, target) {
  // Exige redirecionamento HTTP real (3xx + Location), não meta-refresh.
  const real = r.kind === "http" && r.status >= 300 && r.status < 400;
  check(`${name} -> ${target}`, r.to === target && real, `(status ${r.status}, ${r.kind || "sem redirect"}, destino ${r.to})`);
}
function expectOpen(name, r) {
  check(`${name} -> abre (200)`, r.status === 200 && !r.to, `(status ${r.status}, destino ${r.to})`);
}

try {
  // ---- Preparação ----
  const { data: unitA } = await admin.from("units").select("id").eq("slug", SLUG_A).single();
  const { data: unitB, error: eB } = await admin
    .from("units")
    .insert({ slug: SLUG_B, name: `Teste Acesso ${tag}` })
    .select()
    .single();
  if (eB) throw eB;
  created.units.push(unitB.id);

  const people = {};
  async function mk(key, members) {
    const email = `acc-${key}-${tag}@donguillermo.dev`;
    const password = randomPassword();
    const u = await upsertUser(admin, { email, password, fullName: key });
    created.users.push(u.id);
    for (const m of members) {
      const { error } = await admin
        .from("unit_members")
        .insert({ user_id: u.id, role: m.role, unit_id: m.unit ?? null });
      if (error) throw error;
    }
    people[key] = { id: u.id, cookie: await sessionCookie(email, password), email, password };
  }
  await mk("admin", [{ role: "admin_rede" }]);
  await mk("recepA", [{ role: "recepcao", unit: unitA.id }]);
  await mk("barbA", [{ role: "barbeiro", unit: unitA.id }]);
  await mk("recepB", [{ role: "recepcao", unit: unitB.id }]);
  await mk("semPapel", []);
  await mk("multi", [
    { role: "recepcao", unit: unitA.id },
    { role: "barbeiro", unit: unitB.id },
  ]);

  const AGENDA_A = `/u/${SLUG_A}/agenda`;
  const MINHA_A = `/u/${SLUG_A}/minha-agenda`;
  const FORBIDDEN = "/sem-acesso?motivo=area";

  console.log("\n[sem login]");
  for (const p of ["/", "/admin", AGENDA_A, "/entrar", "/sem-acesso"]) {
    const r = await hit(p);
    const want = p === "/" ? "/login" : `/login?next=${encodeURIComponent(p).replace(/%2F/g, "%2F")}`;
    check(`${p} -> /login (redirect ${r.status})`, r.to?.startsWith("/login") && r.status >= 300 && r.status < 400, `(status ${r.status}, destino ${r.to})`);
    void want;
  }
  expectOpen("/login", await hit("/login"));
  expectOpen("/esqueci-senha", await hit("/esqueci-senha"));

  console.log("\n[admin da rede]");
  expectRedirect("/", await hit("/", people.admin.cookie), "/admin");
  expectOpen("/admin", await hit("/admin", people.admin.cookie));
  expectOpen(`${AGENDA_A} (admin acessa qualquer unidade)`, await hit(AGENDA_A, people.admin.cookie));
  expectOpen(`/u/${SLUG_B}/agenda`, await hit(`/u/${SLUG_B}/agenda`, people.admin.cookie));
  expectRedirect("/u/nao-existe/agenda", await hit("/u/nao-existe/agenda", people.admin.cookie), FORBIDDEN);

  console.log("\n[recepção da unidade A]");
  expectRedirect("/", await hit("/", people.recepA.cookie), AGENDA_A);
  expectOpen(AGENDA_A, await hit(AGENDA_A, people.recepA.cookie));
  expectRedirect("/admin", await hit("/admin", people.recepA.cookie), FORBIDDEN);
  expectRedirect(MINHA_A + " (área do barbeiro)", await hit(MINHA_A, people.recepA.cookie), FORBIDDEN);
  expectRedirect(`/u/${SLUG_B}/agenda (outra unidade)`, await hit(`/u/${SLUG_B}/agenda`, people.recepA.cookie), FORBIDDEN);
  expectRedirect("/u/nao-existe/agenda (mesma resposta de unidade inexistente)", await hit("/u/nao-existe/agenda", people.recepA.cookie), FORBIDDEN);

  console.log("\n[barbeiro da unidade A]");
  expectRedirect("/", await hit("/", people.barbA.cookie), MINHA_A);
  expectOpen(MINHA_A, await hit(MINHA_A, people.barbA.cookie));
  expectRedirect("/admin", await hit("/admin", people.barbA.cookie), FORBIDDEN);
  expectRedirect(AGENDA_A + " (agenda da recepção)", await hit(AGENDA_A, people.barbA.cookie), FORBIDDEN);
  expectRedirect(`/u/${SLUG_B}/minha-agenda`, await hit(`/u/${SLUG_B}/minha-agenda`, people.barbA.cookie), FORBIDDEN);

  console.log("\n[recepção da unidade B]");
  expectRedirect("/", await hit("/", people.recepB.cookie), `/u/${SLUG_B}/agenda`);
  expectRedirect(AGENDA_A + " (unidade A)", await hit(AGENDA_A, people.recepB.cookie), FORBIDDEN);
  expectRedirect("/admin", await hit("/admin", people.recepB.cookie), FORBIDDEN);

  console.log("\n[sem papel]");
  expectRedirect("/", await hit("/", people.semPapel.cookie), "/sem-acesso");
  expectOpen("/sem-acesso", await hit("/sem-acesso", people.semPapel.cookie));
  expectRedirect("/admin", await hit("/admin", people.semPapel.cookie), FORBIDDEN);
  expectRedirect(AGENDA_A, await hit(AGENDA_A, people.semPapel.cookie), FORBIDDEN);
  expectRedirect("/entrar", await hit("/entrar", people.semPapel.cookie), "/sem-acesso");

  console.log("\n[vários papéis/unidades]");
  expectRedirect("/", await hit("/", people.multi.cookie), "/entrar");
  expectOpen("/entrar", await hit("/entrar", people.multi.cookie));
  expectOpen(AGENDA_A, await hit(AGENDA_A, people.multi.cookie));
  expectOpen(`/u/${SLUG_B}/minha-agenda`, await hit(`/u/${SLUG_B}/minha-agenda`, people.multi.cookie));
  expectRedirect(`/u/${SLUG_B}/agenda (é barbeiro lá, não recepção)`, await hit(`/u/${SLUG_B}/agenda`, people.multi.cookie), FORBIDDEN);

  console.log("\n[unidade B desativada]");
  await admin.from("units").update({ is_active: false }).eq("id", unitB.id);
  expectRedirect("recepção B: /", await hit("/", people.recepB.cookie), "/sem-acesso");
  expectRedirect(`recepção B: /u/${SLUG_B}/agenda`, await hit(`/u/${SLUG_B}/agenda`, people.recepB.cookie), FORBIDDEN);
  expectOpen(`admin continua vendo /u/${SLUG_B}/agenda`, await hit(`/u/${SLUG_B}/agenda`, people.admin.cookie));

  console.log("\n[perfil desativado]");
  await admin.from("profiles").update({ is_active: false }).eq("id", people.recepA.id);
  expectRedirect("recepção A inativa: /", await hit("/", people.recepA.cookie), "/sem-acesso");
  expectRedirect("recepção A inativa: agenda", await hit(AGENDA_A, people.recepA.cookie), FORBIDDEN);
} catch (err) {
  failures++;
  console.error("\nErro inesperado:", err.message ?? err);
} finally {
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.units) await admin.from("units").delete().eq("id", id);
  console.log(`\n${total - failures}/${total} verificações passaram.`);
  process.exit(failures ? 1 : 0);
}

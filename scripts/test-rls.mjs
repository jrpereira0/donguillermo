// Teste automatizado de isolamento (RLS): uma unidade não enxerga a outra.
//
// Cria 2 unidades temporárias + usuários temporários, consulta COMO cada
// usuário (anon key + login real, ou seja, com RLS) e confere o que cada um
// vê e o que consegue (ou não) alterar. Limpa tudo no final.
//
// Uso: npm run test:rls
import { adminClient, anonClient, randomPassword, upsertUser } from "./_lib.mjs";

const admin = adminClient();
const tag = Date.now().toString(36);
let failures = 0;
let total = 0;

function check(name, condition, extra = "") {
  total++;
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FALHOU ${name} ${extra}`);
  }
}

async function login(email, password) {
  const c = anonClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}

const created = { users: [], units: [] };

try {
  // ---- Preparação (service_role) ----
  const mkUnit = async (suffix) => {
    const { data, error } = await admin
      .from("units")
      .insert({ slug: `teste-rls-${suffix}-${tag}`, name: `Teste RLS ${suffix} ${tag}` })
      .select()
      .single();
    if (error) throw error;
    created.units.push(data.id);
    return data;
  };
  const unitA = await mkUnit("a");
  const unitB = await mkUnit("b");

  const people = {};
  const mkUser = async (key, role, unit) => {
    const email = `rls-${key}-${tag}@donguillermo.dev`;
    const password = randomPassword();
    const u = await upsertUser(admin, { email, password, fullName: key });
    created.users.push(u.id);
    if (role) {
      const { error } = await admin
        .from("unit_members")
        .insert({ user_id: u.id, role, unit_id: unit?.id ?? null });
      if (error) throw error;
    }
    people[key] = { id: u.id, email, password };
  };
  await mkUser("recepA", "recepcao", unitA);
  await mkUser("barbA", "barbeiro", unitA);
  await mkUser("recepB", "recepcao", unitB);
  await mkUser("admin", "admin_rede", null);
  await mkUser("semPapel", null, null);

  const ids = (rows) => (rows ?? []).map((r) => r.id).sort();
  const slugs = (rows) => (rows ?? []).map((r) => r.slug);

  // ---- 1) Anônimo ----
  console.log("\n[anônimo, sem login]");
  {
    const c = anonClient();
    const u = await c.from("units").select("id");
    const m = await c.from("unit_members").select("id");
    const p = await c.from("profiles").select("id");
    check("não lê units", !u.data?.length);
    check("não lê unit_members", !m.data?.length);
    check("não lê profiles", !p.data?.length);
  }

  // ---- 2) Recepção A ----
  console.log("\n[recepção da unidade A]");
  {
    const c = await login(people.recepA.email, people.recepA.password);
    const u = await c.from("units").select("id, slug");
    check("vê a unidade A", ids(u.data).includes(unitA.id));
    check("NÃO vê a unidade B", !ids(u.data).includes(unitB.id));
    check("vê somente 1 unidade", (u.data ?? []).length === 1, JSON.stringify(slugs(u.data)));

    const m = await c.from("unit_members").select("id, unit_id, user_id");
    check("vê vínculos só da unidade A", (m.data ?? []).every((r) => r.unit_id === unitA.id));
    check("vê o barbeiro da própria unidade", (m.data ?? []).some((r) => r.user_id === people.barbA.id));
    check("NÃO vê a recepção da unidade B", !(m.data ?? []).some((r) => r.user_id === people.recepB.id));

    const p = await c.from("profiles").select("id");
    check("vê o perfil do barbeiro A", ids(p.data).includes(people.barbA.id));
    check("NÃO vê o perfil da recepção B", !ids(p.data).includes(people.recepB.id));
    check("NÃO vê o perfil do admin", !ids(p.data).includes(people.admin.id));

    const ins = await c.from("units").insert({ slug: `hack-${tag}`, name: "Invasora" });
    check("NÃO cria unidade", !!ins.error);

    const upd = await c.from("units").update({ name: "Hackeada" }).eq("id", unitB.id).select();
    check("NÃO altera a unidade B", !upd.data?.length);
    const updA = await c.from("units").update({ name: "Renomeada" }).eq("id", unitA.id).select();
    check("NÃO altera nem a própria unidade (só admin)", !updA.data?.length);

    const esc = await c
      .from("unit_members")
      .insert({ user_id: people.recepA.id, role: "admin_rede", unit_id: null });
    check("NÃO se promove a admin_rede", !!esc.error);

    const self = await c.from("profiles").update({ is_active: true }).eq("id", people.recepA.id);
    check("NÃO altera is_active do próprio perfil", !!self.error);
    const name = await c.from("profiles").update({ full_name: "Novo Nome" }).eq("id", people.recepA.id).select();
    check("altera o próprio nome", name.data?.length === 1);
  }

  // ---- 3) Recepção B ----
  console.log("\n[recepção da unidade B]");
  {
    const c = await login(people.recepB.email, people.recepB.password);
    const u = await c.from("units").select("id");
    check("vê só a unidade B", ids(u.data).length === 1 && ids(u.data)[0] === unitB.id);
    const p = await c.from("profiles").select("id");
    check("NÃO vê o perfil do barbeiro A", !ids(p.data).includes(people.barbA.id));
  }

  // ---- 4) Barbeiro A ----
  console.log("\n[barbeiro da unidade A]");
  {
    const c = await login(people.barbA.email, people.barbA.password);
    const u = await c.from("units").select("id");
    check("vê a própria unidade", ids(u.data).includes(unitA.id) && ids(u.data).length === 1);
    const m = await c.from("unit_members").select("user_id");
    check("vê só o próprio vínculo", (m.data ?? []).length === 1 && m.data[0].user_id === people.barbA.id);
    const p = await c.from("profiles").select("id");
    check("vê só o próprio perfil", ids(p.data).length === 1 && ids(p.data)[0] === people.barbA.id);
  }

  // ---- 5) Sem papel ----
  console.log("\n[usuário autenticado sem papel]");
  {
    const c = await login(people.semPapel.email, people.semPapel.password);
    const u = await c.from("units").select("id");
    const m = await c.from("unit_members").select("id");
    check("não vê unidades", !u.data?.length);
    check("não vê vínculos", !m.data?.length);
  }

  // ---- 6) Admin da rede ----
  console.log("\n[admin da rede]");
  {
    const c = await login(people.admin.email, people.admin.password);
    const u = await c.from("units").select("id");
    check("vê as duas unidades", ids(u.data).includes(unitA.id) && ids(u.data).includes(unitB.id));
    const upd = await c.from("units").update({ name: `Teste RLS B renomeada ${tag}` }).eq("id", unitB.id).select();
    check("altera uma unidade", upd.data?.length === 1);
    const p = await c.from("profiles").select("id");
    check("vê perfis de várias unidades", ids(p.data).includes(people.recepA.id) && ids(p.data).includes(people.recepB.id));
  }

  // ---- 7) Unidade desativada ----
  console.log("\n[unidade B desativada]");
  {
    await admin.from("units").update({ is_active: false }).eq("id", unitB.id);
    const c = await login(people.recepB.email, people.recepB.password);
    const u = await c.from("units").select("id");
    check("recepção B perde acesso à unidade inativa", !u.data?.length);
    const adm = await login(people.admin.email, people.admin.password);
    const ua = await adm.from("units").select("id").eq("id", unitB.id);
    check("admin ainda vê a unidade inativa", ua.data?.length === 1);
  }
} catch (err) {
  failures++;
  console.error("\nErro inesperado:", err.message ?? err);
} finally {
  // ---- Limpeza ----
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.units) await admin.from("units").delete().eq("id", id);
  console.log(`\n${total - failures}/${total} verificações passaram.`);
  process.exit(failures ? 1 : 0);
}

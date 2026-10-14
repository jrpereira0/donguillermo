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

const created = { users: [], units: [], photos: [] };

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

  // ---- 7) Profissionais e fotos ----
  console.log("\n[profissionais e fotos]");
  {
    const mkBarber = async (unit, fields) => {
      const { data, error } = await admin
        .from("barbers")
        .insert({ unit_id: unit.id, ...fields })
        .select()
        .single();
      if (error) throw error;
      return data;
    };
    const barberA = await mkBarber(unitA, {
      user_id: people.barbA.id,
      full_name: "João da Silva",
      display_name: "João",
      cnpj: "11222333000181",
    });
    const barberB = await mkBarber(unitB, { full_name: "Pedro Souza", display_name: "Pedro" });

    const rA = await login(people.recepA.email, people.recepA.password);
    const list = await rA.from("barbers").select("id");
    check("recepção A vê só os barbeiros da unidade A", ids(list.data).length === 1 && ids(list.data)[0] === barberA.id);
    const ins = await rA.from("barbers").insert({ unit_id: unitA.id, full_name: "Invasor", display_name: "Inv" });
    check("recepção NÃO insere barbeiro direto (só o servidor)", !!ins.error);
    const upd = await rA.from("barbers").update({ display_name: "Joãozinho", commission_services_pct: 40 }).eq("id", barberA.id).select();
    check("recepção A edita barbeiro da própria unidade", upd.data?.length === 1);
    const updB = await rA.from("barbers").update({ display_name: "Hack" }).eq("id", barberB.id).select();
    check("recepção A NÃO edita barbeiro da unidade B", !updB.data?.length);
    const moveUnit = await rA.from("barbers").update({ unit_id: unitB.id }).eq("id", barberA.id);
    check("NÃO troca a unidade do barbeiro", !!moveUnit.error);
    const moveUser = await rA.from("barbers").update({ user_id: people.recepA.id }).eq("id", barberA.id);
    check("NÃO troca a conta (user_id) do barbeiro", !!moveUser.error);
    const badPct = await rA.from("barbers").update({ commission_products_pct: 101 }).eq("id", barberA.id);
    check("comissão acima de 100% é rejeitada", !!badPct.error);

    // 1x1 PNG (menor imagem válida)
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const pathA = `${unitA.id}/${barberA.id}.png`;
    const pathB = `${unitB.id}/${barberB.id}.png`;
    created.photos.push(pathA, pathB);
    const bucket = (c) => c.storage.from("barber-photos");

    const up = await bucket(rA).upload(pathA, png, { contentType: "image/png", upsert: true });
    check("recepção A envia foto para a pasta da unidade A", !up.error, up.error?.message);
    const upOther = await bucket(rA).upload(pathB, png, { contentType: "image/png", upsert: true });
    check("recepção A NÃO envia foto para a pasta da unidade B", !!upOther.error);
    const upMime = await bucket(rA).upload(`${unitA.id}/${barberA.id}.jpg`, Buffer.from("texto"), { contentType: "text/plain" });
    check("tipo de arquivo fora de imagem é rejeitado", !!upMime.error);
    const upBig = await bucket(rA).upload(`${unitA.id}/${barberA.id}.webp`, Buffer.alloc(1_100_000, 1), { contentType: "image/webp" });
    check("arquivo acima de 1 MB é rejeitado", !!upBig.error);
    const upName = await bucket(rA).upload(`${unitA.id}/qualquer-nome.png`, png, { contentType: "image/png" });
    check("nome fora do padrão <unidade>/<barbeiro>.png é rejeitado", !!upName.error);

    const savedPhoto = await rA.from("barbers").update({ photo_path: pathA }).eq("id", barberA.id).select();
    check("recepção A salva o caminho da foto", savedPhoto.data?.length === 1);
    const wrongPhoto = await rA.from("barbers").update({ photo_path: pathB }).eq("id", barberA.id);
    check("NÃO aponta a foto para a pasta de outra unidade", !!wrongPhoto.error);

    // A foto é pública (aparecerá na página pública de agendamento).
    const pub = bucket(anonClient()).getPublicUrl(pathA).data.publicUrl;
    const res = await fetch(pub);
    check("foto abre por URL pública, sem login", res.status === 200, `status ${res.status}`);

    const rB = await login(people.recepB.email, people.recepB.password);
    const lb = await rB.from("barbers").select("id");
    check("recepção B vê só o barbeiro da unidade B", ids(lb.data).length === 1 && ids(lb.data)[0] === barberB.id);
    const rm = await bucket(rB).remove([pathA]);
    const stillThere = await fetch(pub);
    check("recepção B NÃO apaga foto da unidade A", stillThere.status === 200 && !(rm.data ?? []).length, JSON.stringify(rm.data));

    const bc = await login(people.barbA.email, people.barbA.password);
    const own = await bc.from("barbers").select("id");
    check("barbeiro A vê só a própria linha", ids(own.data).length === 1 && ids(own.data)[0] === barberA.id);
    const ownUpd = await bc.from("barbers").update({ commission_services_pct: 100 }).eq("id", barberA.id).select();
    check("barbeiro NÃO altera a própria comissão", !ownUpd.data?.length);
    const upBarb = await bucket(bc).upload(`${unitA.id}/${barberA.id}.png`, png, { contentType: "image/png", upsert: true });
    check("barbeiro NÃO envia foto", !!upBarb.error);

    const adm = await login(people.admin.email, people.admin.password);
    const all = await adm.from("barbers").select("id");
    // O banco de desenvolvimento pode ter outros profissionais reais: confere só os dois deste teste.
    const allIds = ids(all.data);
    check("admin vê barbeiros das duas unidades", allIds.includes(barberA.id) && allIds.includes(barberB.id));
    const upAdm = await bucket(adm).upload(pathB, png, { contentType: "image/png", upsert: true });
    check("admin envia foto em qualquer unidade", !upAdm.error, upAdm.error?.message);

    const sem = await login(people.semPapel.email, people.semPapel.password);
    const none = await sem.from("barbers").select("id");
    check("usuário sem papel não vê barbeiros", !none.data?.length);
    const anon = await anonClient().from("barbers").select("id");
    check("anônimo não lê barbeiros", !anon.data?.length);
  }

  // ---- 8) Unidade desativada ----
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
  if (created.photos.length) await admin.storage.from("barber-photos").remove(created.photos).catch(() => {});
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.units) await admin.from("units").delete().eq("id", id);
  console.log(`\n${total - failures}/${total} verificações passaram.`);
  process.exit(failures ? 1 : 0);
}

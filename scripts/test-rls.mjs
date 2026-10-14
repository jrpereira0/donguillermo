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

const created = { users: [], units: [], photos: [], images: [], customers: [], customerPhotos: [] };

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

  // ---- 7b) Serviços, imagens e quem faz cada serviço ----
  console.log("\n[serviços, imagens e ligações]");
  {
    const mk = async (table, row) => {
      const { data, error } = await admin.from(table).insert(row).select().single();
      if (error) throw error;
      return data;
    };
    const bA = await mk("barbers", { unit_id: unitA.id, full_name: "Serv Barbeiro A", display_name: "ServA" });
    const bB = await mk("barbers", { unit_id: unitB.id, full_name: "Serv Barbeiro B", display_name: "ServB" });
    const sB = await mk("services", { unit_id: unitB.id, name: "Barba B " + tag, category: "barba", duration_minutes: 20, price_cents: 3000 });

    const rA = await login(people.recepA.email, people.recepA.password);
    const ins = await rA.from("services").insert({ unit_id: unitA.id, name: "Corte " + tag, category: "cabelo", duration_minutes: 30, price_cents: 4500 }).select().single();
    check("recepção A cria serviço na unidade A", !ins.error, ins.error?.message);
    const sA = ins.data;
    const other = await rA.from("services").insert({ unit_id: unitB.id, name: "Invasor " + tag, category: "cabelo", duration_minutes: 30, price_cents: 100 });
    check("recepção A NÃO cria serviço na unidade B", !!other.error);
    const dup = await rA.from("services").insert({ unit_id: unitA.id, name: " CORTE " + tag, category: "cabelo", duration_minutes: 30, price_cents: 100 });
    check("nome repetido na unidade é rejeitado", !!dup.error);
    const cat = await rA.from("services").insert({ unit_id: unitA.id, name: "Cat " + tag, category: "hack", duration_minutes: 30, price_cents: 100 });
    check("categoria inválida é rejeitada", !!cat.error);
    const dur = await rA.from("services").insert({ unit_id: unitA.id, name: "Dur " + tag, category: "cabelo", duration_minutes: 4, price_cents: 100 });
    check("duração fora do limite é rejeitada", !!dur.error);
    const upd = await rA.from("services").update({ price_cents: 5000, category: "combo" }).eq("id", sA.id).select();
    check("recepção A edita serviço da própria unidade", upd.data?.length === 1);
    const updB = await rA.from("services").update({ price_cents: 1 }).eq("id", sB.id).select();
    check("recepção A NÃO edita serviço da unidade B", !updB.data?.length);
    const move = await rA.from("services").update({ unit_id: unitB.id }).eq("id", sA.id);
    check("NÃO troca a unidade do serviço", !!move.error);
    const del = await rA.from("services").delete().eq("id", sA.id).select();
    check("NÃO exclui serviço", !!del.error || !del.data?.length);
    const seen = await rA.from("services").select("id");
    check("recepção A vê o serviço A e NÃO vê o da unidade B", ids(seen.data).includes(sA.id) && !ids(seen.data).includes(sB.id));

    // Imagem do serviço (bucket service-images)
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const imgA = `${unitA.id}/${sA.id}.png`;
    const imgB = `${unitB.id}/${sB.id}.png`;
    created.images.push(imgA, imgB);
    const bucket = (c) => c.storage.from("service-images");
    const up = await bucket(rA).upload(imgA, png, { contentType: "image/png", upsert: true });
    check("recepção A envia imagem para a pasta da unidade A", !up.error, up.error?.message);
    const upOther = await bucket(rA).upload(imgB, png, { contentType: "image/png", upsert: true });
    check("recepção A NÃO envia imagem para a pasta da unidade B", !!upOther.error);
    const upMime = await bucket(rA).upload(`${unitA.id}/${sA.id}.jpg`, Buffer.from("texto"), { contentType: "text/plain" });
    check("tipo de arquivo fora de imagem é rejeitado", !!upMime.error);
    const upBig = await bucket(rA).upload(`${unitA.id}/${sA.id}.webp`, Buffer.alloc(1_100_000, 1), { contentType: "image/webp" });
    check("imagem acima de 1 MB é rejeitada", !!upBig.error);
    const saved = await rA.from("services").update({ image_path: imgA }).eq("id", sA.id).select();
    check("recepção A salva o caminho da imagem", saved.data?.length === 1);
    const wrong = await rA.from("services").update({ image_path: imgB }).eq("id", sA.id);
    check("NÃO aponta a imagem para a pasta de outra unidade", !!wrong.error);
    const pub = bucket(anonClient()).getPublicUrl(imgA).data.publicUrl;
    const res = await fetch(pub);
    check("imagem abre por URL pública, sem login", res.status === 200, `status ${res.status}`);

    // Ligações barbeiro x serviço
    const link = await rA.from("barber_services").insert({ barber_id: bA.id, service_id: sA.id, unit_id: unitA.id });
    check("recepção A liga barbeiro e serviço da unidade A", !link.error, link.error?.message);
    const crossBarber = await rA.from("barber_services").insert({ barber_id: bB.id, service_id: sA.id, unit_id: unitA.id });
    check("NÃO liga barbeiro de outra unidade", !!crossBarber.error);
    const crossService = await rA.from("barber_services").insert({ barber_id: bA.id, service_id: sB.id, unit_id: unitA.id });
    check("NÃO liga serviço de outra unidade", !!crossService.error);
    const crossUnit = await rA.from("barber_services").insert({ barber_id: bB.id, service_id: sB.id, unit_id: unitB.id });
    check("recepção A NÃO cria ligação na unidade B", !!crossUnit.error);
    const own = await rA.from("barber_services").update({ duration_minutes: 45 }).eq("barber_id", bA.id).eq("service_id", sA.id).select();
    check("recepção A define a duração própria do barbeiro", own.data?.length === 1 && own.data[0].duration_minutes === 45);
    const badOwn = await rA.from("barber_services").update({ duration_minutes: 4 }).eq("barber_id", bA.id).eq("service_id", sA.id);
    check("duração própria fora do limite é rejeitada", !!badOwn.error);
    const swap = await rA.from("barber_services").update({ barber_id: bB.id }).eq("barber_id", bA.id);
    check("NÃO troca o barbeiro da ligação", !!swap.error);
    const mine = await rA.from("barber_services").select("barber_id");
    check("recepção A vê a ligação da própria unidade", (mine.data ?? []).length === 1);

    const bc = await login(people.barbA.email, people.barbA.password);
    const bl = await bc.from("barber_services").select("barber_id");
    check("barbeiro lê as ligações da própria unidade", (bl.data ?? []).length === 1);
    const bs = await bc.from("services").select("id");
    check("barbeiro lê o catálogo da própria unidade", ids(bs.data).includes(sA.id) && !ids(bs.data).includes(sB.id));
    const bIns = await bc.from("services").insert({ unit_id: unitA.id, name: "Do barbeiro " + tag, category: "cabelo", duration_minutes: 30, price_cents: 100 });
    check("barbeiro NÃO cria serviço", !!bIns.error);
    const bUpd = await bc.from("services").update({ price_cents: 1 }).eq("id", sA.id).select();
    check("barbeiro NÃO edita serviço", !bUpd.data?.length);
    const bLink = await bc.from("barber_services").insert({ barber_id: bA.id, service_id: sA.id, unit_id: unitA.id });
    check("barbeiro NÃO cria ligação", !!bLink.error);
    const bDel = await bc.from("barber_services").delete().eq("barber_id", bA.id).select();
    check("barbeiro NÃO remove ligação", !bDel.data?.length);
    const bImg = await bucket(bc).upload(`${unitA.id}/${sA.id}.png`, png, { contentType: "image/png", upsert: true });
    check("barbeiro NÃO envia imagem de serviço", !!bImg.error);

    const rB = await login(people.recepB.email, people.recepB.password);
    const sv = await rB.from("services").select("id");
    check("recepção B NÃO vê serviço da unidade A", !ids(sv.data).includes(sA.id));
    const lk = await rB.from("barber_services").select("barber_id");
    check("recepção B NÃO vê ligações da unidade A", !(lk.data ?? []).length);
    const lkDel = await rB.from("barber_services").delete().eq("barber_id", bA.id).select();
    check("recepção B NÃO remove ligação da unidade A", !lkDel.data?.length);
    const rm = await bucket(rB).remove([imgA]);
    const still = await fetch(pub);
    check("recepção B NÃO apaga imagem da unidade A", still.status === 200 && !(rm.data ?? []).length);

    const adm = await login(people.admin.email, people.admin.password);
    const as2 = await adm.from("services").select("id");
    check("admin vê serviços das duas unidades", ids(as2.data).includes(sA.id) && ids(as2.data).includes(sB.id));
    const admIns = await adm.from("services").insert({ unit_id: unitB.id, name: "Do admin " + tag, category: "massagem", duration_minutes: 60, price_cents: 9000 });
    check("admin cria serviço em qualquer unidade", !admIns.error, admIns.error?.message);
    const admImg = await bucket(adm).upload(imgB, png, { contentType: "image/png", upsert: true });
    check("admin envia imagem em qualquer unidade", !admImg.error, admImg.error?.message);

    const sem = await login(people.semPapel.email, people.semPapel.password);
    const none = await sem.from("services").select("id");
    const noneL = await sem.from("barber_services").select("barber_id");
    check("usuário sem papel não vê serviços nem ligações", !none.data?.length && !noneL.data?.length);
    const anonS = await anonClient().from("services").select("id");
    const anonL = await anonClient().from("barber_services").select("barber_id");
    check("anônimo não lê serviços nem ligações", !anonS.data?.length && !anonL.data?.length);
  }

  // ---- 7) Clientes (cadastro único da rede) e observações ----
  console.log("\n[clientes e observações]");
  {
    const rA = await login(people.recepA.email, people.recepA.password);
    const rB = await login(people.recepB.email, people.recepB.password);
    const bc = await login(people.barbA.email, people.barbA.password);
    const adm = await login(people.admin.email, people.admin.password);
    const sem = await login(people.semPapel.email, people.semPapel.password);
    const anon = anonClient();
    const uuid = () => crypto.randomUUID();
    // CPF válido e diferente a cada execução (o CPF é único na rede inteira)
    const cpfOf = () => {
      const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
      for (const len of [9, 10]) {
        let sum = 0;
        for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
        const r = (sum * 10) % 11;
        d.push(r === 10 ? 0 : r);
      }
      return d.join("");
    };
    const cpf = cpfOf();

    const idA = uuid();
    const insA = await rA.from("customers").insert({ id: idA, created_unit_id: unitA.id, full_name: "Cliente Teste RLS " + tag, phone: "11912345678", cpf });
    if (!insA.error) created.customers.push(idA);
    check("recepção A cadastra cliente com origem na unidade A", !insA.error, insA.error?.message);

    const rows = await rA.from("customers").select("id, registered_via, created_unit_id").eq("id", idA);
    check("cliente nasce como 'recepcao' e com a unidade de origem", rows.data?.[0]?.registered_via === "recepcao" && rows.data?.[0]?.created_unit_id === unitA.id, JSON.stringify(rows.data));

    const idX = uuid();
    const insB = await rA.from("customers").insert({ id: idX, created_unit_id: unitB.id, full_name: "Origem Errada " + tag });
    if (!insB.error) created.customers.push(idX);
    check("recepção A NÃO cadastra com origem na unidade B", !!insB.error);
    const idY = uuid();
    const insAuto = await rA.from("customers").insert({ id: idY, created_unit_id: unitA.id, registered_via: "autocadastro", full_name: "Auto " + tag });
    if (!insAuto.error) created.customers.push(idY);
    check("recepção NÃO grava como 'autocadastro'", !!insAuto.error);
    const idZ = uuid();
    const dupCpf = await rA.from("customers").insert({ id: idZ, created_unit_id: unitA.id, full_name: "Cpf Repetido " + tag, cpf });
    if (!dupCpf.error) created.customers.push(idZ);
    check("CPF repetido na rede é rejeitado", !!dupCpf.error);
    const badPhone = await rA.from("customers").update({ phone: "123" }).eq("id", idA);
    check("telefone inválido é rejeitado", !!badPhone.error);
    const badMail = await rA.from("customers").update({ email: "sem-arroba" }).eq("id", idA);
    check("e-mail inválido é rejeitado", !!badMail.error);

    const full = await rA
      .from("customers")
      .update({ email: "teste@donguillermo.dev", birth_date: "1990-05-20", referral_source: "instagram", marketing_consent: true, consent_at: new Date().toISOString(), state: "SP", cep: "01310100" })
      .eq("id", idA)
      .select();
    check("recepção A edita a ficha completa", full.data?.length === 1, full.error?.message);
    const moveOrigin = await rA.from("customers").update({ created_unit_id: unitB.id }).eq("id", idA);
    check("unidade de origem NÃO muda", !!moveOrigin.error);
    const changeVia = await rA.from("customers").update({ registered_via: "autocadastro" }).eq("id", idA);
    check("forma de cadastro NÃO muda", !!changeVia.error);
    const del = await rA.from("customers").delete().eq("id", idA).select();
    check("NÃO exclui cliente (sem DELETE)", !!del.error || !del.data?.length);

    const names = await rA.rpc("network_units");
    const nameIds = (names.data ?? []).map((u) => u.id);
    check("network_units() lista as unidades da rede para a recepção", nameIds.includes(unitA.id) && nameIds.includes(unitB.id), JSON.stringify(names.error));

    // A ficha é da rede: a recepção de outra unidade vê e edita
    const seeB = await rB.from("customers").select("id, created_unit_id").eq("id", idA);
    check("recepção B VÊ o cliente cadastrado na unidade A", seeB.data?.length === 1 && seeB.data[0].created_unit_id === unitA.id);
    const updB = await rB.from("customers").update({ city: "Santo André" }).eq("id", idA).select();
    check("recepção B edita o cliente da unidade A", updB.data?.length === 1, updB.error?.message);
    const keep = await rB.from("customers").select("created_unit_id").eq("id", idA);
    check("a origem continua a unidade A", keep.data?.[0]?.created_unit_id === unitA.id);
    const idB = uuid();
    const insFromB = await rB.from("customers").insert({ id: idB, created_unit_id: unitB.id, full_name: "Cliente B " + tag, phone: "11922223333" });
    if (!insFromB.error) created.customers.push(idB);
    check("recepção B cadastra cliente com origem na unidade B", !insFromB.error, insFromB.error?.message);

    // Quem não é recepção/admin
    const bRead = await bc.from("customers").select("id");
    check("barbeiro NÃO lê clientes", !bRead.data?.length);
    const idW = uuid();
    const bIns = await bc.from("customers").insert({ id: idW, created_unit_id: unitA.id, full_name: "Do Barbeiro " + tag });
    if (!bIns.error) created.customers.push(idW);
    check("barbeiro NÃO cadastra cliente", !!bIns.error);
    const bUpd = await bc.from("customers").update({ city: "Hack" }).eq("id", idA).select();
    check("barbeiro NÃO edita cliente", !bUpd.data?.length);
    const bUnits = await bc.rpc("network_units");
    check("barbeiro NÃO lista unidades da rede", !(bUnits.data ?? []).length);
    const semRead = await sem.from("customers").select("id");
    check("usuário sem papel não lê clientes", !semRead.data?.length);
    const anonRead = await anon.from("customers").select("id");
    check("anônimo não lê clientes", !anonRead.data?.length);
    const anonIns = await anon.from("customers").insert({ id: uuid(), created_unit_id: unitA.id, full_name: "Anon " + tag });
    check("anônimo não cadastra cliente", !!anonIns.error);
    const anonUnits = await anon.rpc("network_units");
    check("anônimo não lista unidades pela função", !(anonUnits.data ?? []).length);

    const admRead = await adm.from("customers").select("id").in("id", [idA, idB]);
    check("admin vê clientes de todas as origens", (admRead.data ?? []).length === 2);

    // ---- Observações ----
    const n1 = await rA.from("customer_notes").insert({ customer_id: idA, unit_id: unitA.id, body: "Gosta de máquina 2." }).select("id, created_by, author_name, unit_id");
    check("recepção A adiciona observação", n1.data?.length === 1, n1.error?.message);
    const note = n1.data?.[0];
    check("autor vem da sessão e o nome fica gravado", note?.created_by === people.recepA.id && !!note?.author_name, JSON.stringify(note));
    const forged = await rA.from("customer_notes").insert({ customer_id: idA, unit_id: unitA.id, body: "Forjada", created_by: people.recepB.id });
    check("NÃO assina como outra pessoa", !!forged.error);
    const forgedName = await rA.from("customer_notes").insert({ customer_id: idA, unit_id: unitA.id, body: "Forjada", author_name: "Fulano" });
    check("NÃO escolhe o nome do autor", !!forgedName.error);
    const wrongUnit = await rA.from("customer_notes").insert({ customer_id: idA, unit_id: unitB.id, body: "Unidade errada" });
    check("recepção A NÃO grava observação com a unidade B", !!wrongUnit.error);
    const empty = await rA.from("customer_notes").insert({ customer_id: idA, unit_id: unitA.id, body: "   " });
    check("observação vazia é rejeitada", !!empty.error);
    const long = await rA.from("customer_notes").insert({ customer_id: idA, unit_id: unitA.id, body: "a".repeat(1001) });
    check("observação acima de 1000 caracteres é rejeitada", !!long.error);
    const n2 = await rA.from("customer_notes").insert({ customer_id: idA, unit_id: unitA.id, body: "Alergia a pomada X." }).select("id");
    check("o cliente pode ter várias observações", n2.data?.length === 1, n2.error?.message);
    const list = await rA.from("customer_notes").select("id").eq("customer_id", idA);
    check("recepção A lê as observações do cliente", (list.data ?? []).length === 2);

    const edit = await rA.from("customer_notes").update({ body: "Gosta da máquina 3." }).eq("id", note.id).select("body, created_by, created_at, updated_at");
    check("recepção A edita a observação", edit.data?.[0]?.body === "Gosta da máquina 3.", edit.error?.message);
    check("editar preserva o autor e atualiza updated_at", edit.data?.[0]?.created_by === people.recepA.id && edit.data[0].updated_at > edit.data[0].created_at);
    const swapAuthor = await rA.from("customer_notes").update({ created_by: people.recepB.id }).eq("id", note.id);
    check("autor da observação NÃO muda", !!swapAuthor.error);
    const swapUnit = await rA.from("customer_notes").update({ unit_id: unitB.id }).eq("id", note.id);
    check("unidade da observação NÃO muda", !!swapUnit.error);
    const swapCustomer = await rA.from("customer_notes").update({ customer_id: idB }).eq("id", note.id);
    check("a observação NÃO muda de cliente", !!swapCustomer.error);

    const seeNotesB = await rB.from("customer_notes").select("id").eq("customer_id", idA);
    check("recepção B lê as observações do cliente da unidade A", (seeNotesB.data ?? []).length === 2);
    const editB = await rB.from("customer_notes").update({ body: "Editada pela B." }).eq("id", note.id).select("created_by");
    check("recepção B edita observação escrita pela A", editB.data?.length === 1 && editB.data[0].created_by === people.recepA.id, editB.error?.message);
    const noteB = await rB.from("customer_notes").insert({ customer_id: idA, unit_id: unitB.id, body: "Escrita na B." }).select("id, unit_id");
    check("recepção B escreve no cliente da A com a própria unidade", noteB.data?.[0]?.unit_id === unitB.id, noteB.error?.message);
    const noteBwrong = await rB.from("customer_notes").insert({ customer_id: idA, unit_id: unitA.id, body: "Na unidade A pela B" });
    check("recepção B NÃO grava observação com a unidade A", !!noteBwrong.error);
    const delB = await rB.from("customer_notes").delete().eq("id", noteB.data?.[0]?.id).select("id");
    check("recepção B exclui observação", delB.data?.length === 1, delB.error?.message);

    const bNotes = await bc.from("customer_notes").select("id");
    check("barbeiro NÃO lê observações", !bNotes.data?.length);
    const bNoteIns = await bc.from("customer_notes").insert({ customer_id: idA, unit_id: unitA.id, body: "Do barbeiro" });
    check("barbeiro NÃO escreve observação", !!bNoteIns.error);
    const bNoteDel = await bc.from("customer_notes").delete().eq("customer_id", idA).select("id");
    check("barbeiro NÃO exclui observação", !bNoteDel.data?.length);
    const semNotes = await sem.from("customer_notes").select("id");
    check("usuário sem papel não lê observações", !semNotes.data?.length);
    const anonNotes = await anon.from("customer_notes").select("id");
    check("anônimo não lê observações", !anonNotes.data?.length);
    const anonNoteIns = await anon.from("customer_notes").insert({ customer_id: idA, unit_id: unitA.id, body: "Anon" });
    check("anônimo não escreve observação", !!anonNoteIns.error);

    const admNote = await adm.from("customer_notes").insert({ customer_id: idB, unit_id: unitB.id, body: "Do admin" }).select("id");
    check("admin escreve observação em qualquer unidade", admNote.data?.length === 1, admNote.error?.message);
    const delA = await rA.from("customer_notes").delete().eq("id", note.id).select("id");
    check("recepção A exclui a própria observação", delA.data?.length === 1, delA.error?.message);

    // ---- Fotos dos clientes (Storage) ----
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const photoBucket = (c) => c.storage.from("customer-photos");
    const photoPath = idA + ".png";
    created.customerPhotos.push(photoPath);
    const up = await photoBucket(rA).upload(photoPath, png, { contentType: "image/png", upsert: true });
    check("recepção A envia a foto do cliente (<id>.png)", !up.error, up.error?.message);
    const upFolder = await photoBucket(rA).upload(unitA.id + "/" + photoPath, png, { contentType: "image/png" });
    check("foto dentro de pasta é rejeitada", !!upFolder.error);
    const upName = await photoBucket(rA).upload("foto.png", png, { contentType: "image/png" });
    check("nome que não é o id do cliente em UUID é rejeitado", !!upName.error);
    const upMime = await photoBucket(rA).upload(idA + ".webp", Buffer.from("texto"), { contentType: "text/plain" });
    check("tipo de arquivo fora de imagem é rejeitado", !!upMime.error);
    const upBig = await photoBucket(rA).upload(uuid() + ".webp", Buffer.alloc(1_100_000, 1), { contentType: "image/webp" });
    check("foto acima de 1 MB é rejeitada", !!upBig.error);
    const saved = await rA.from("customers").update({ photo_path: photoPath }).eq("id", idA).select("id");
    check("recepção A salva o caminho da foto no cliente", saved.data?.length === 1, saved.error?.message);
    const badPhoto = await rA.from("customers").update({ photo_path: "foto.png" }).eq("id", idA);
    check("caminho de foto fora do padrão é rejeitado", !!badPhoto.error);
    const pub = photoBucket(anon).getPublicUrl(photoPath).data.publicUrl;
    const res = await fetch(pub);
    check("foto abre por URL pública, sem login", res.status === 200, "status " + res.status);
    const bUp = await photoBucket(bc).upload(uuid() + ".png", png, { contentType: "image/png" });
    check("barbeiro NÃO envia foto de cliente", !!bUp.error);
    const semUp = await photoBucket(sem).upload(uuid() + ".png", png, { contentType: "image/png" });
    check("usuário sem papel NÃO envia foto de cliente", !!semUp.error);
    const admPhoto = uuid() + ".png";
    created.customerPhotos.push(admPhoto);
    const admUp = await photoBucket(adm).upload(admPhoto, png, { contentType: "image/png" });
    check("admin envia foto de cliente", !admUp.error, admUp.error?.message);
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
    const cu = await c.from("customers").select("id");
    check("recepção B perde acesso aos clientes (unidade inativa)", !cu.data?.length);
  }
} catch (err) {
  failures++;
  console.error("\nErro inesperado:", err.message ?? err);
} finally {
  // ---- Limpeza ----
  if (created.photos.length) await admin.storage.from("barber-photos").remove(created.photos).catch(() => {});
  if (created.images.length) await admin.storage.from("service-images").remove(created.images).catch(() => {});
  if (created.customerPhotos.length) await admin.storage.from("customer-photos").remove(created.customerPhotos).catch(() => {});
  if (created.customers.length) await admin.from("customers").delete().in("id", created.customers);
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.units) await admin.from("units").delete().eq("id", id);
  console.log(`\n${total - failures}/${total} verificações passaram.`);
  process.exit(failures ? 1 : 0);
}

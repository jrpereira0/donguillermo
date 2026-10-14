// Teste PONTA A PONTA (navegador de verdade) da área Clientes.
//
// Cria duas unidades e usuários temporários (recepção A, recepção B e um barbeiro), abre o app
// no Edge/Chrome instalado e percorre os fluxos reais: validar e cadastrar (com foto), CPF
// repetido, lista, busca, paginação, edição, foto removida, observações (adicionar, editar,
// excluir, com avisos), histórico vazio, desativar/reativar, cliente visto por outra unidade
// (a origem não muda), barbeiro sem acesso e telas no celular. Confere no banco o que foi
// gravado e apaga tudo que criou no fim.
//
// Uso: npm run test:e2e:clientes     (app em http://localhost:3000, com `npm run dev` rodando)
//      APP_URL=http://localhost:3001 npm run test:e2e:clientes
//      HEADED=1 npm run test:e2e:clientes   (abre a janela para acompanhar)
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright-core";
import { adminClient, randomPassword, upsertUser } from "./_lib.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = adminClient();
const tag = Date.now().toString(36);
const SLUG_A = `teste-e2e-cli-a-${tag}`;
const SLUG_B = `teste-e2e-cli-b-${tag}`;
const NAME_A = `E2E Clientes A ${tag}`;
const SHOTS = ".e2e-artifacts";
const created = { users: [], unitIds: [] };
let total = 0;
let failures = 0;

function check(name, ok, extra = "") {
  total++;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok    " : "FALHOU"} ${name} ${ok ? "" : extra}`);
}

// ---------- imagem de teste (PNG 800x600 gerado aqui) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function makePng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      const i = o + 1 + x * 3;
      raw[i] = Math.floor((x * 255) / w);
      raw[i + 1] = Math.floor((y * 255) / h);
      raw[i + 2] = (x ^ y) & 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** CPF válido e novo a cada execução (o CPF é único na rede inteira). */
function newCpf() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join("");
}

// ---------- ajudantes ----------
let page;
const urlA = (path) => `${APP}/u/${SLUG_A}${path}`;
const notice = (text) => page.getByRole("status").filter({ hasText: text });
const tabBtn = (id) => page.locator(`#customer-tab-${id}`);
async function overflowX() {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
async function shot(name) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
}
/** Repete a consulta até dar certo (as server actions terminam depois do clique). */
async function eventually(fn, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > end) return false;
    await new Promise((r) => setTimeout(r, 400));
  }
}
async function flow(name, fn) {
  console.log(`\n[${name}]`);
  try {
    await fn();
  } catch (err) {
    check("fluxo concluído sem erro inesperado", false, String(err.message ?? err).split("\n")[0]);
    await shot(name.replace(/\W+/g, "-"));
  }
}
const one = async (table, filter) => {
  const q = admin.from(table).select("*");
  for (const [k, v] of Object.entries(filter)) q.eq(k, v);
  const { data } = await q;
  return data ?? [];
};
async function loginAs(pg, email, password) {
  await pg.goto(`${APP}/entrar`);
  await pg.locator("#email").fill(email);
  await pg.locator("#password").fill(password);
  await pg.getByRole("button", { name: "Entrar" }).click();
  await pg.waitForURL(/\/u\/.+\/(agenda|minha-agenda)/);
}

let browser;
try {
  // ---------- preparação (service_role) ----------
  const mkUnit = async (slug, name) => {
    const { data, error } = await admin.from("units").insert({ slug, name }).select().single();
    if (error) throw error;
    created.unitIds.push(data.id);
    return data;
  };
  const unitA = await mkUnit(SLUG_A, NAME_A);
  const unitB = await mkUnit(SLUG_B, `E2E Clientes B ${tag}`);

  const mkUser = async (key, role, unit) => {
    const email = `e2e-${key}-${tag}@donguillermo.dev`;
    const password = randomPassword();
    const u = await upsertUser(admin, { email, password, fullName: `Pessoa ${key}` });
    created.users.push(u.id);
    const { error } = await admin.from("unit_members").insert({ user_id: u.id, unit_id: unit.id, role });
    if (error) throw error;
    return { id: u.id, email, password };
  };
  const recepA = await mkUser("recepa", "recepcao", unitA);
  const recepB = await mkUser("recepb", "recepcao", unitB);
  const barbA = await mkUser("barba", "barbeiro", unitA);

  browser = await chromium.launch({ channel: process.env.BROWSER ?? "msedge", headless: !process.env.HEADED });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(120_000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const NAME = `José Ânimo ${tag}`;
  const PHONE = "11912345678";
  const CPF = newCpf();
  let customerId = null;

  await flow("login", async () => {
    await loginAs(page, recepA.email, recepA.password);
    check("recepção entra e cai na agenda da unidade", page.url().includes(`/u/${SLUG_A}/agenda`), page.url());
    check("menu lateral tem o item Clientes", (await page.getByRole("link", { name: "Clientes", exact: true }).count()) === 1);
  });

  await flow("cadastro: validações", async () => {
    await page.goto(urlA("/clientes/novo"));
    check("cadastro novo não mostra barra de abas", !(await page.getByRole("tablist").isVisible()));
    await page.getByRole("button", { name: /Cadastrar cliente/ }).click();
    await page.getByText("Informe o nome do cliente.").waitFor();
    check("nome vazio: mensagem no campo", true);
    check("telefone vazio: mensagem no campo", (await page.getByText("Informe o telefone.").count()) >= 1);
    await page.locator("#phone").fill("11912345678");
    check("máscara do telefone", (await page.locator("#phone").inputValue()) === "(11) 91234-5678", await page.locator("#phone").inputValue());
    await page.locator("#cpf").fill("11111111111");
    await page.locator("#cpf").blur();
    await page.getByText("CPF inválido. Confira os números.").waitFor();
    check("CPF inválido: aviso ao sair do campo", true);
    check("máscara do CPF", (await page.locator("#cpf").inputValue()) === "111.111.111-11");
    await page.locator("#email").fill("nao-e-email");
    await page.locator("#email").blur();
    await page.getByText("Informe um e-mail válido.").waitFor();
    check("e-mail inválido: aviso ao sair do campo", true);
    check("nada foi gravado", (await admin.from("customers").select("id").ilike("full_name", `%${tag}%`)).data?.length === 0);
  });

  await flow("cadastro completo (com foto)", async () => {
    await page.goto(urlA("/clientes/novo"));
    await page.locator("#fullName").fill(NAME);
    await page.locator("#phone").fill(PHONE);
    await page.locator("#email").fill("Jose.Animo@Exemplo.com");
    await page.locator("#birthDate").fill("1990-05-20");
    await page.locator("#cpf").fill(CPF);
    await page.locator("#street").fill("Rua Teste");
    await page.locator("#streetNumber").fill("123");
    await page.locator("#neighborhood").fill("Centro");
    await page.locator("#city").fill("São Bernardo do Campo");
    await page.locator("#state").fill("sp");

    await page.locator('input[type="file"]').setInputFiles({ name: "cliente.png", mimeType: "image/png", buffer: makePng(800, 600) });
    await page.getByRole("dialog").getByRole("button", { name: /Usar (foto|imagem)/ }).click();
    await page.getByRole("button", { name: "Trocar foto" }).waitFor();
    check("foto enviada (botão vira 'Trocar foto')", true);

    await page.locator("#referral").click();
    await page.getByRole("option", { name: "Instagram", exact: true }).click();
    check("seção 'Como nos conheceu' fica na primeira aba", (await page.locator("#customer-panel-dados").getByText("Como nos conheceu").count()) >= 1);
    await page.locator("#customer-panel-dados").getByText("Aceita receber novidades").click();
    await shot("cli-cadastro");

    await page.getByRole("button", { name: /Cadastrar cliente/ }).click();
    await page.waitForURL(/\/clientes\?aviso=criado/);
    await notice("Cliente cadastrado").waitFor();
    check("redireciona para a lista com o aviso 'Cliente cadastrado'", true);

    const [c] = await one("customers", { full_name: NAME });
    customerId = c?.id ?? null;
    check("banco: unidade de origem e forma de cadastro", c?.created_unit_id === unitA.id && c?.registered_via === "recepcao", JSON.stringify(c));
    check("banco: telefone e CPF só com dígitos", c?.phone === PHONE && c?.cpf === CPF, `${c?.phone} ${c?.cpf}`);
    check("banco: e-mail em minúsculas e UF em maiúsculas", c?.email === "jose.animo@exemplo.com" && c?.state === "SP", `${c?.email} ${c?.state}`);
    check("banco: nascimento, endereço e 'como conheceu'", c?.birth_date === "1990-05-20" && c?.street === "Rua Teste" && c?.city === "São Bernardo do Campo" && c?.referral_source === "instagram");
    check("banco: consentimento ligado e com data", c?.marketing_consent === true && !!c?.consent_at);
    check("banco: foto salva como <id>.<ext> (sem pasta)", new RegExp(`^${customerId}\\.(webp|jpg|png)$`).test(c?.photo_path ?? ""), c?.photo_path);
    const pub = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/customer-photos/${c?.photo_path}`);
    check("foto abre por URL pública", pub.status === 200, `status ${pub.status}`);
  });

  await flow("CPF repetido", async () => {
    await page.goto(urlA("/clientes/novo"));
    await page.locator("#fullName").fill(`Duplicado ${tag}`);
    await page.locator("#phone").fill("11988887777");
    await page.locator("#cpf").fill(CPF);
    await page.getByRole("button", { name: /Cadastrar cliente/ }).click();
    await page.getByText("Já existe um cliente com este CPF.").waitFor();
    check("CPF repetido: erro no campo", true);
    check("o que foi digitado continua no formulário", (await page.locator("#fullName").inputValue()) === `Duplicado ${tag}`);
    check("banco: duplicado não foi gravado", (await admin.from("customers").select("id").eq("full_name", `Duplicado ${tag}`)).data?.length === 0);
  });

  await flow("lista e busca", async () => {
    await page.goto(urlA("/clientes"));
    const row = page.locator("li", { hasText: NAME });
    await row.waitFor();
    const text = await row.innerText();
    check("lista mostra telefone com máscara", text.includes("(11) 91234-5678"), text);
    check("lista mostra a unidade de origem e 'Recepção'", text.includes(NAME_A) && /Recepção/i.test(text), text);
    check("lista mostra a foto", (await row.locator("img[src*='customer-photos']").count()) >= 1);
    check("lista mostra o status Ativo", /ativo/i.test(await row.textContent()));
    await shot("cli-lista");

    const search = page.locator('input[type="search"]');
    const find = async (q) => {
      await search.fill(q);
      await page.waitForURL(new RegExp(`q=${encodeURIComponent(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      return page.locator("li", { hasText: NAME }).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
    };
    check("busca por nome sem acento ('jose animo')", await find(`jose animo ${tag}`));
    check("busca por parte do telefone", await find("91234"));
    check("busca por CPF", await find(CPF.slice(0, 6)));
    check("busca por e-mail", await find("jose.animo@exemplo"));
    await search.fill(`zzzz-nao-existe-${tag}`);
    await page.getByText("Nenhum cliente encontrado").waitFor();
    check("busca sem resultado mostra 'Nenhum cliente encontrado'", true);
    await page.getByRole("link", { name: "Limpar busca" }).click();
    await page.waitForURL((u) => !u.search.includes("q="));
    check("'Limpar busca' volta à lista completa", true);
  });

  await flow("paginação (22 clientes)", async () => {
    const rows = Array.from({ length: 22 }, (_, i) => ({
      created_unit_id: unitA.id,
      full_name: `Paginacao ${tag} ${String(i + 1).padStart(2, "0")}`,
    }));
    const { error } = await admin.from("customers").insert(rows);
    if (error) throw error;
    await page.goto(urlA(`/clientes?q=${encodeURIComponent(`paginacao ${tag}`)}`));
    await page.getByText("22 clientes encontrados").waitFor();
    check("conta os 22 encontrados", true);
    check("página 1 mostra 20", (await page.locator("main li, li").filter({ hasText: `Paginacao ${tag}` }).count()) === 20);
    await page.getByText("Página 1 de 2").waitFor();
    await page.getByRole("link", { name: /Próxima/ }).click();
    await page.getByText("Página 2 de 2").waitFor();
    check("página 2 mostra os 2 restantes", (await page.locator("li").filter({ hasText: `Paginacao ${tag}` }).count()) === 2);
    await page.getByRole("link", { name: /Anterior/ }).click();
    await page.getByText("Página 1 de 2").waitFor();
    check("botão Anterior volta para a página 1", true);
  });

  await flow("edição e foto", async () => {
    await page.goto(urlA("/clientes"));
    await page.locator("li", { hasText: NAME }).getByRole("link", { name: NAME }).click();
    await page.waitForURL(/\/clientes\/[0-9a-f-]{36}$/);
    const header = await page.locator("main").innerText();
    check("cabeçalho mostra a idade e 'Cliente desde'", /\d+ anos/.test(header) && header.includes("Cliente desde"), header.slice(0, 200));
    check("cabeçalho cita 'cadastrado em' a unidade A", header.includes(`cadastrado em ${NAME_A}`), header.slice(0, 200));
    check("cabeçalho NÃO mostra o telefone", !header.split("\n").slice(0, 8).join(" ").includes("(11) 91234-5678"));
    check("campos vêm preenchidos", (await page.locator("#fullName").inputValue()) === NAME && (await page.locator("#cpf").inputValue()) === CPF.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"));
    check("edição tem as 4 abas", (await page.getByRole("tab").count()) === 4);

    await page.locator("#fullName").fill(`${NAME} Editado`);
    await page.locator("#customer-panel-dados").getByText("Aceita receber novidades").click();
    await page.getByRole("button", { name: /Salvar alterações/ }).click();
    await notice("Alterações salvas").waitFor();
    check("aviso 'Alterações salvas'", true);
    let [c] = await one("customers", { id: customerId });
    check("banco: nome atualizado e origem preservada", c?.full_name === `${NAME} Editado` && c?.created_unit_id === unitA.id && c?.registered_via === "recepcao");
    check("banco: consentimento desligado zera a data", c?.marketing_consent === false && c?.consent_at === null);
    check("banco: foto continua", !!c?.photo_path);

    // religar mantém uma data nova; remover foto apaga o arquivo
    const oldPhoto = c.photo_path;
    await page.getByRole("button", { name: "Remover" }).click();
    await page.getByRole("button", { name: /Salvar alterações/ }).click();
    check("banco: foto removida do cadastro", await eventually(async () => (await one("customers", { id: customerId }))[0]?.photo_path === null));
    // a action apaga o arquivo depois de atualizar o cadastro: espera um pouco
    check(
      "arquivo da foto antiga apagado do Storage",
      await eventually(async () => !((await admin.storage.from("customer-photos").list("")).data ?? []).some((f) => f.name === oldPhoto)),
    );
    await page.locator("#fullName").fill(NAME);
    await page.getByRole("button", { name: /Salvar alterações/ }).click();
    await eventually(async () => (await one("customers", { id: customerId }))[0]?.full_name === NAME);
  });

  await flow("observações (lista com avisos)", async () => {
    await page.goto(urlA(`/clientes/${customerId}`));
    await tabBtn("observacoes").click();
    await page.getByText("Nenhuma observação ainda").waitFor();
    check("estado vazio das observações", true);
    const add = async (t) => {
      await page.locator("#note-new").fill(t);
      await page.getByRole("button", { name: "Adicionar observação" }).click();
      await notice("Observação adicionada").waitFor();
      await page.locator("#customer-panel-observacoes li p.whitespace-pre-wrap", { hasText: t }).waitFor();
      await page.waitForFunction(() => document.querySelector("#note-new").value === "");
    };
    await add("Gosta de máquina 2.");
    check("aviso ao adicionar", true);
    await add("Alergia a pomada X.");
    const li = page.locator("#customer-panel-observacoes li");
    check("lista com 2 observações, a mais recente primeiro", (await li.count()) === 2 && (await li.first().innerText()).includes("Alergia"));
    let notes = await admin.from("customer_notes").select("*").eq("customer_id", customerId).order("created_at");
    check("banco: autor, unidade e texto", notes.data?.length === 2 && notes.data[0].created_by === recepA.id && notes.data[0].unit_id === unitA.id && !!notes.data[0].author_name, JSON.stringify(notes.data?.[0]));
    check("cada observação mostra autor e unidade", (await li.first().innerText()).includes(NAME_A));

    await li.first().getByRole("button", { name: "Editar" }).click();
    await li.first().locator("textarea").fill("Alergia a pomada Y.");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await notice("Observação atualizada").waitFor();
    check("aviso ao editar", true);
    await li.first().locator("p.whitespace-pre-wrap", { hasText: "Alergia a pomada Y." }).waitFor();
    notes = await admin.from("customer_notes").select("*").eq("customer_id", customerId).order("created_at");
    check("banco: texto novo e autor preservado", notes.data?.[1].body === "Alergia a pomada Y." && notes.data[1].created_by === recepA.id);
    check("lista mostra 'editada em'", (await li.first().innerText()).includes("editada em"));

    await li.first().getByRole("button", { name: "Editar" }).click();
    await li.first().locator("textarea").fill("   ");
    check("salvar fica desabilitado com texto vazio", await page.getByRole("button", { name: "Salvar", exact: true }).isDisabled());
    await page.getByRole("button", { name: "Cancelar" }).click();

    await li.first().getByRole("button", { name: "Excluir observação" }).click();
    await page.getByText("Excluir esta observação?").waitFor();
    await li.first().getByRole("button", { name: "Excluir", exact: true }).click();
    await notice("Observação excluída").waitFor();
    check("aviso ao excluir", true);
    await page.waitForFunction(() => document.querySelectorAll("#customer-panel-observacoes li").length === 1);
    notes = await admin.from("customer_notes").select("*").eq("customer_id", customerId);
    check("banco: sobrou a observação mais antiga", notes.data?.length === 1 && notes.data[0].body === "Gosta de máquina 2.");
    await shot("cli-observacoes");
  });

  await flow("histórico e situação", async () => {
    await page.goto(urlA(`/clientes/${customerId}`));
    await tabBtn("historico").click();
    await page.getByText("Nenhuma comanda ainda").waitFor();
    const panel = await page.locator("#customer-panel-historico").innerText();
    check("histórico vazio com resumo zerado (visitas, total, ticket médio)", /0/.test(panel) && panel.includes("R$ 0,00"), panel.slice(0, 200));

    await tabBtn("situacao").click();
    await page.locator("#customer-panel-situacao").getByRole("button", { name: "Desativar" }).click();
    check("banco: cliente desativado", await eventually(async () => (await one("customers", { id: customerId }))[0]?.is_active === false));
    await page.goto(urlA(`/clientes?q=${encodeURIComponent(NAME)}`));
    const row = page.locator("li", { hasText: NAME }).first();
    check("lista mostra o cliente como Inativo", /inativo/i.test(await row.textContent()));
    await row.getByRole("button", { name: /Reativar/ }).click();
    check("botão da lista reativa o cliente", await eventually(async () => (await one("customers", { id: customerId }))[0]?.is_active === true));
  });

  await flow("outra unidade vê o cliente (origem não muda)", async () => {
    const ctxB = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
    const pb = await ctxB.newPage();
    pb.setDefaultTimeout(60_000);
    pb.setDefaultNavigationTimeout(120_000);
    pb.on("pageerror", (e) => pageErrors.push(e.message));
    await loginAs(pb, recepB.email, recepB.password);
    await pb.goto(`${APP}/u/${SLUG_B}/clientes?q=${encodeURIComponent(NAME)}`);
    const row = pb.locator("li", { hasText: NAME }).first();
    await row.waitFor();
    check("recepção da unidade B vê o cliente cadastrado na A", true);
    check("lista da B mostra a unidade A como origem", (await row.innerText()).includes(NAME_A));
    await row.getByRole("link", { name: NAME }).click();
    await pb.waitForURL(/\/clientes\/[0-9a-f-]{36}$/);
    await pb.locator("#city").fill("Santo André");
    await pb.getByRole("button", { name: /Salvar alterações/ }).click();
    await pb.getByRole("status").filter({ hasText: "Alterações salvas" }).waitFor();
    const [c] = await one("customers", { id: customerId });
    check("banco: B editou e a origem continua a unidade A", c?.city === "Santo André" && c?.created_unit_id === unitA.id);

    await pb.locator("#customer-tab-observacoes").click();
    await pb.locator("#note-new").fill("Escrita pela unidade B.");
    await pb.getByRole("button", { name: "Adicionar observação" }).click();
    await pb.getByRole("status").filter({ hasText: "Observação adicionada" }).waitFor();
    const nb = (await admin.from("customer_notes").select("*").eq("customer_id", customerId).eq("body", "Escrita pela unidade B.")).data?.[0];
    check("banco: observação da B gravada com a unidade B", nb?.unit_id === unitB.id && nb?.created_by === recepB.id);
    const del = await pb.locator("#customer-panel-observacoes li", { hasText: "Gosta de máquina 2." });
    check("B enxerga a observação escrita pela A", (await del.count()) === 1);
    await ctxB.close();

    await page.goto(urlA(`/clientes/${customerId}`));
    await tabBtn("observacoes").click();
    check("A enxerga a observação da B, com o nome da unidade B", (await page.locator("#customer-panel-observacoes li", { hasText: "Escrita pela unidade B." }).innerText()).includes(`E2E Clientes B ${tag}`));
  });

  await flow("barbeiro sem acesso", async () => {
    const ctxBarb = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
    const pg = await ctxBarb.newPage();
    pg.setDefaultTimeout(60_000);
    pg.setDefaultNavigationTimeout(120_000);
    await loginAs(pg, barbA.email, barbA.password);
    for (const path of ["/clientes", "/clientes/novo", `/clientes/${customerId}`]) {
      await pg.goto(urlA(path));
      await pg.waitForURL(/sem-acesso/, { timeout: 30_000 }).catch(() => {});
      check(`barbeiro em ${path.replace(customerId ?? "x", ":id")} é barrado`, pg.url().includes("sem-acesso"), pg.url());
    }
    await pg.goto(urlA("/minha-agenda"));
    check("menu do barbeiro não tem Clientes", (await pg.getByRole("link", { name: "Clientes", exact: true }).count()) === 0);
    await ctxBarb.close();
  });

  await flow("celular (390 px): sem rolagem lateral", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/clientes", "/clientes/novo", `/clientes/${customerId}`]) {
      await page.goto(urlA(path));
      await page.waitForLoadState("networkidle").catch(() => {});
      const extra = await overflowX();
      check(`${path.replace(customerId ?? "x", ":id")} cabe na tela`, extra <= 1, `sobra ${extra}px`);
    }
    await shot("cli-celular");
    await page.setViewportSize({ width: 1366, height: 900 });
  });

  check("nenhum erro de JavaScript no navegador durante os fluxos", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} catch (err) {
  failures++;
  console.error("\nErro inesperado:", err.message ?? err);
} finally {
  // ---------- limpeza ----------
  await browser?.close().catch(() => {});
  const { data: mine } = await admin.from("customers").select("id, photo_path").in("created_unit_id", created.unitIds);
  const photos = (mine ?? []).map((c) => c.photo_path).filter(Boolean);
  if (photos.length) await admin.storage.from("customer-photos").remove(photos).catch(() => {});
  if (mine?.length) await admin.from("customers").delete().in("id", mine.map((c) => c.id));
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.unitIds) await admin.from("units").delete().eq("id", id);
  console.log(`\n${total - failures}/${total} verificações passaram.`);
  process.exit(failures ? 1 : 0);
}

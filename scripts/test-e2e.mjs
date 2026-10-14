// Teste PONTA A PONTA (navegador de verdade) das áreas Serviços e Profissionais.
//
// Cria uma unidade e usuários temporários, abre o app no Edge/Chrome instalado (sem baixar
// navegador), entra pela tela de login e percorre os fluxos reais: cadastrar, validar,
// editar, vincular profissionais e serviços (com duração própria), enviar imagem, desativar
// e conferir no banco o que foi gravado. No fim apaga tudo que criou.
//
// Uso: npm run test:e2e            (app em http://localhost:3000, com `npm run dev` rodando)
//      APP_URL=http://localhost:3001 npm run test:e2e
//      HEADED=1 npm run test:e2e   (abre a janela para acompanhar)
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright-core";
import { adminClient, randomPassword, upsertUser } from "./_lib.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = adminClient();
const tag = Date.now().toString(36);
const SLUG = `teste-e2e-${tag}`;
const SHOTS = ".e2e-artifacts";
const created = { users: [], unitId: null };
let total = 0;
let failures = 0;

function check(name, ok, extra = "") {
  total++;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok    " : "FALHOU"} ${name} ${ok ? "" : extra}`);
}

// ---------- imagem de teste (PNG 800x600 gerado aqui, sem arquivo no repositório) ----------
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
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- ajudantes de tela ----------
let page;
const tab = (name) => page.getByRole("tab", { name, exact: true });
const notice = (text) => page.getByRole("status").filter({ hasText: text });
const url = (path) => `${APP}/u/${SLUG}${path}`;

async function pickOption(triggerSelector, label) {
  await page.locator(triggerSelector).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
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

/** Roda um fluxo; se algo estourar (timeout, elemento ausente) registra falha e segue para o próximo. */
async function flow(name, fn) {
  console.log(`\n[${name}]`);
  try {
    await fn();
  } catch (err) {
    check(`fluxo concluído sem erro inesperado`, false, String(err.message ?? err).split("\n")[0]);
    await shot(name.replace(/\W+/g, "-"));
  }
}

const one = async (table, filter) => {
  const q = admin.from(table).select("*");
  for (const [k, v] of Object.entries(filter)) q.eq(k, v);
  const { data } = await q;
  return data ?? [];
};

let browser;
try {
  // ---------- preparação (service_role) ----------
  const { data: unit, error: ue } = await admin.from("units").insert({ slug: SLUG, name: `Teste E2E ${tag}` }).select().single();
  if (ue) throw ue;
  created.unitId = unit.id;

  const recepPass = randomPassword();
  const recepEmail = `e2e-recep-${tag}@donguillermo.dev`;
  const recep = await upsertUser(admin, { email: recepEmail, password: recepPass, fullName: "Recepção E2E" });
  created.users.push(recep.id);
  const { error: me } = await admin.from("unit_members").insert({ user_id: recep.id, unit_id: unit.id, role: "recepcao" });
  if (me) throw me;

  const mkBarber = async (name) => {
    const { data, error } = await admin
      .from("barbers")
      .insert({ unit_id: unit.id, full_name: `${name} Sobrenome`, display_name: name })
      .select()
      .single();
    if (error) throw error;
    return data;
  };
  const alfa = await mkBarber("E2E Alfa");
  const beta = await mkBarber("E2E Beta");

  browser = await chromium.launch({ channel: process.env.BROWSER ?? "msedge", headless: !process.env.HEADED });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(120_000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // ---------- login ----------
  await flow("login pela tela", async () => {
    await page.goto(`${APP}/entrar`);
    await page.locator("#email").fill(recepEmail);
    await page.locator("#password").fill(recepPass);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/u\/.+\/agenda/);
    check("recepção entra e cai na agenda da unidade", page.url().includes(`/u/${SLUG}/agenda`), page.url());
  });

  // ---------- serviços ----------
  let serviceId = null;
  await flow("serviços: estado vazio", async () => {
    await page.goto(url("/servicos"));
    await page.getByText("Monte o catálogo da unidade").waitFor();
    check("mostra o estado vazio do catálogo", true);
    const cats = await page.getByText("Categorias disponíveis").locator("..").locator("li").allTextContents();
    check("lista as 11 categorias, com Outros por último", cats.length === 11 && cats.at(-1)?.trim() === "Outros", JSON.stringify(cats));
  });

  await flow("serviços: cadastrar (com imagem e profissionais)", async () => {
    await page.goto(url("/servicos/novo"));
    await page.locator("#name").fill("Corte E2E");
    await pickOption("#category", "Barba");
    await page.locator("#description").fill("Corte feito pelo teste automático.");
    check("contador da descrição acompanha o texto", (await page.getByText(/\/300$/).textContent())?.startsWith("34/"));

    // imagem: escolher, ajustar e confirmar
    await page.locator('input[type="file"]').setInputFiles({ name: "teste.png", mimeType: "image/png", buffer: makePng(800, 600) });
    await page.getByRole("dialog").getByRole("button", { name: "Usar imagem" }).click();
    await page.getByRole("button", { name: "Trocar imagem" }).waitFor();
    check("imagem enviada (botão vira 'Trocar imagem')", true);
    check("aparece a pré-visualização da imagem", (await page.locator("#service-panel-dados img").count()) === 1);

    await tab("Preço e duração").click();
    await page.locator("#price").fill("4500");
    check("máscara do preço: 4500 vira 45,00", (await page.locator("#price").inputValue()) === "45,00");
    await pickOption("#duration", "45 min");

    await tab("Profissionais").click();
    check("lista os dois profissionais ativos", (await page.locator("#service-panel-equipe li label").count()) === 2);
    await page.locator("label", { hasText: "E2E Alfa" }).click();
    check("contador mostra 1 de 2", (await page.locator("#service-panel-equipe").getByText(/de 2 profissionais/).textContent())?.includes("1"));
    await pickOption(`#barber-minutes-${alfa.id}`, "1h");
    await page.locator("#service-panel-equipe").getByRole("button", { name: "Marcar todos" }).click();
    check("'Marcar todos' marca os dois", (await page.locator("#service-panel-equipe input[type=checkbox]:checked").count()) === 2);
    await page.locator("#service-panel-equipe").getByRole("button", { name: "Desmarcar todos" }).click();
    check("'Desmarcar todos' limpa", (await page.locator("#service-panel-equipe input[type=checkbox]:checked").count()) === 0);
    await page.locator("label", { hasText: "E2E Alfa" }).click();
    await pickOption(`#barber-minutes-${alfa.id}`, "1h");

    await page.getByRole("button", { name: /Cadastrar serviço/ }).click();
    await page.waitForURL(/\/servicos\?aviso=criado/);
    await notice("Serviço cadastrado").waitFor();
    check("redireciona para a lista com o aviso 'Serviço cadastrado'", true);

    const row = page.locator("li", { hasText: "Corte E2E" });
    await row.waitFor();
    const text = await row.innerText();
    check("lista mostra preço, duração e categoria", text.includes("R$ 45,00") && text.includes("45 min") && text.includes("Barba"), text);
    check("lista mostra a imagem enviada", (await row.locator("img[src*='service-images']").count()) >= 1);
    check("lista mostra o profissional vinculado", (await row.locator("[aria-label^='Profissionais:']").getAttribute("aria-label"))?.includes("E2E Alfa"));

    const [svc] = await one("services", { unit_id: unit.id, name: "Corte E2E" });
    serviceId = svc?.id ?? null;
    check("banco: serviço gravado com preço, duração e categoria", svc?.price_cents === 4500 && svc?.duration_minutes === 45 && svc?.category === "barba", JSON.stringify(svc));
    check("banco: caminho da imagem na pasta da unidade", svc?.image_path?.startsWith(`${unit.id}/${svc.id}.`));
    const links = await one("barber_services", { service_id: svc.id });
    check("banco: ligação com Alfa e duração própria de 60 min", links.length === 1 && links[0].barber_id === alfa.id && links[0].duration_minutes === 60, JSON.stringify(links));
    const files = await admin.storage.from("service-images").list(unit.id);
    const size = files.data?.[0]?.metadata?.size ?? 0;
    check("storage: imagem comprimida (abaixo de 120 KB)", size > 0 && size < 120 * 1024, `${size} bytes`);
  });

  await flow("serviços: validações", async () => {
    await page.goto(url("/servicos/novo"));
    await page.locator("#name").fill("corte e2e ");
    await tab("Preço e duração").click();
    await page.locator("#price").fill("4000");
    await page.getByRole("button", { name: /Cadastrar serviço/ }).click();
    await page.getByText("Já existe um serviço com este nome nesta unidade.").waitFor();
    check("nome repetido (sem diferenciar caixa) é recusado com mensagem", true);
    check("mantém o que foi digitado após o erro", (await page.locator("#name").inputValue()) === "corte e2e ");

    await page.locator("#name").fill("X");
    await tab("Preço e duração").click();
    await page.locator("#price").fill("");
    await page.getByRole("button", { name: /Cadastrar serviço/ }).click();
    // O aviso geral é o mesmo do erro anterior: esperamos pelo erro do campo, que é novo.
    await page.getByText("Informe o nome do serviço.").waitFor();
    check("nome curto mostra o erro no campo", true);
    check("abre sozinho a aba com erro", (await page.locator("#service-tab-dados").getAttribute("aria-selected")) === "true");
    await page.locator("#service-tab-preco").click();
    check("preço vazio mostra o erro no campo", await page.getByText(/Informe o preço/).first().isVisible());
    check("não criou nenhum serviço a mais", (await one("services", { unit_id: unit.id })).length === 1);
  });

  await flow("serviços: editar", async () => {
    await page.goto(url("/servicos"));
    await page.locator("li", { hasText: "Corte E2E" }).getByRole("link", { name: "Corte E2E" }).click();
    await page.waitForURL(new RegExp(`/servicos/${serviceId}$`));
    check("clicar no nome abre a edição", true);
    check("campos vêm preenchidos", (await page.locator("#name").inputValue()) === "Corte E2E");
    await tab("Preço e duração").click();
    check("preço e duração vêm preenchidos", (await page.locator("#price").inputValue()) === "45,00");
    await page.locator("#price").fill("5000");
    await tab("Profissionais").click();
    check("Alfa já vem marcado com 1h", (await page.locator(`#barber-minutes-${alfa.id}`).innerText()).includes("1h"));
    await page.locator("label", { hasText: "E2E Alfa" }).click(); // desmarca
    await page.locator("label", { hasText: "E2E Beta" }).click(); // marca
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await notice("Alterações salvas").waitFor();
    check("mostra o aviso 'Alterações salvas'", true);

    const [svc] = await one("services", { id: serviceId });
    check("banco: preço atualizado para R$ 50,00", svc.price_cents === 5000);
    const links = await one("barber_services", { service_id: serviceId });
    check("banco: Alfa removido e Beta ligado (duração padrão)", links.length === 1 && links[0].barber_id === beta.id && links[0].duration_minutes === null, JSON.stringify(links));

    // mudar só a duração própria do Beta
    await pickOption(`#barber-minutes-${beta.id}`, "30 min");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    const okBeta = await eventually(async () => (await one("barber_services", { service_id: serviceId }))[0]?.duration_minutes === 30);
    check("banco: duração própria do Beta atualizada para 30 min", okBeta, JSON.stringify(await one("barber_services", { service_id: serviceId })));
  });

  await flow("serviços: busca e categorias", async () => {
    await page.goto(url("/servicos"));
    await page.getByLabel("Buscar serviço").fill("zzz");
    await page.getByText("Nenhum serviço encontrado").waitFor();
    check("busca sem resultado mostra a mensagem", true);
    await page.getByRole("button", { name: "Limpar busca" }).click();
    await page.getByLabel("Buscar serviço").fill("barba");
    check("busca por categoria encontra o serviço", await page.locator("li", { hasText: "Corte E2E" }).isVisible());
  });

  // ---------- profissionais ----------
  let newBarberId = null;
  await flow("profissionais: cadastrar (com login e serviços)", async () => {
    await page.goto(url("/profissionais/novo"));
    await page.locator("#firstName").fill("Carlos");
    await page.locator("#lastName").fill("Teste E2E");
    await page.locator("#displayName").fill("Carlão E2E");

    await tab("Acesso").click();
    const email = `e2e-barber-${tag}@donguillermo.dev`;
    await page.locator("#email").fill("isso-nao-e-email");
    await page.locator("#email").blur();
    check("e-mail inválido mostra erro ao sair do campo", await page.getByText(/e-mail válido|e-mail inválido/i).first().isVisible().catch(() => false));
    await page.locator("#email").fill(email);
    await page.getByRole("button", { name: "Gerar senha forte" }).click();
    check("gerar senha preenche os dois campos", (await page.locator("#barber-password").inputValue()).length >= 10 && (await page.locator("#barber-password").inputValue()) === (await page.locator("#barber-confirm").inputValue()));

    await tab("Serviços").click();
    check("lista o serviço ativo da unidade", (await page.locator("#barber-panel-servicos li label").count()) === 1);
    await page.locator("label", { hasText: "Corte E2E" }).click();
    const svcId = serviceId;
    await pickOption(`#service-minutes-${svcId}`, "1h");

    await page.getByRole("button", { name: "Cadastrar profissional" }).click();
    await page.waitForURL(/\/profissionais\?aviso=criado/);
    await notice("Profissional cadastrado").waitFor();
    check("redireciona para a lista com o aviso 'Profissional cadastrado'", true);

    const [b] = await one("barbers", { unit_id: unit.id, display_name: "Carlão E2E" });
    newBarberId = b?.id ?? null;
    if (b?.user_id) created.users.push(b.user_id);
    check("banco: profissional gravado na unidade, ativo e com login", !!b && b.is_active && !!b.user_id, JSON.stringify(b));
    const links = await one("barber_services", { barber_id: b.id });
    check("banco: serviço ligado com duração própria de 60 min", links.length === 1 && links[0].service_id === serviceId && links[0].duration_minutes === 60, JSON.stringify(links));
    const { data: prof } = await admin.from("profiles").select("email").eq("id", b.user_id).single();
    check("login criado com o e-mail informado", prof?.email === email, prof?.email);

    const row = page.locator("li", { hasText: "Carlão E2E" });
    await row.waitFor();
    check("lista de profissionais mostra o novo profissional", await row.isVisible());
  });

  await flow("profissionais: validações", async () => {
    await page.goto(url("/profissionais/novo"));
    await page.getByRole("button", { name: "Cadastrar profissional" }).click();
    await page.getByText("Confira os campos destacados.").waitFor();
    check("formulário vazio é recusado com o aviso geral", true);
    check("nenhum profissional a mais foi criado", (await one("barbers", { unit_id: unit.id })).length === 3);
  });

  await flow("profissionais: editar", async () => {
    await page.goto(url("/profissionais"));
    await page.locator("li", { hasText: "Carlão E2E" }).getByRole("link", { name: /Carlão E2E/ }).first().click();
    await page.waitForURL(new RegExp(`/profissionais/${newBarberId}$`));
    check("clicar no nome abre a edição", true);
    await page.locator("#displayName").fill("Carlão Editado");
    await tab("Serviços").click();
    check("o serviço já vem marcado, com 1h", (await page.locator(`#service-minutes-${serviceId}`).innerText()).includes("1h"));
    await pickOption(`#service-minutes-${serviceId}`, "Padrão (45 min)");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await notice("Alterações salvas").waitFor();
    check("mostra o aviso 'Alterações salvas'", true);
    const [b] = await one("barbers", { id: newBarberId });
    check("banco: apelido atualizado", b.display_name === "Carlão Editado");
    const links = await one("barber_services", { barber_id: newBarberId });
    check("banco: duração própria voltou ao padrão (null)", links.length === 1 && links[0].duration_minutes === null, JSON.stringify(links));

    await page.locator("label", { hasText: "Corte E2E" }).click(); // desmarca
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    const removed = await eventually(async () => (await one("barber_services", { barber_id: newBarberId })).length === 0);
    check("banco: desmarcar o serviço remove a ligação", removed);
  });

  await flow("profissionais: busca", async () => {
    await page.goto(url("/profissionais"));
    const search = page.getByRole("searchbox").first();
    await search.fill("zzzz");
    await page.getByText("Nenhum profissional encontrado").waitFor();
    check("busca sem resultado mostra a mensagem", true);
    await search.fill("alfa");
    check("busca por nome encontra o profissional", await page.locator("li", { hasText: "E2E Alfa" }).first().isVisible());
  });

  // ---------- desativar ----------
  await flow("serviços: desativar", async () => {
    await page.goto(url(`/servicos/${serviceId}`));
    await tab("Situação").click();
    await page.locator("#service-panel-situacao").getByRole("button", { name: "Desativar" }).click();
    check("banco: serviço desativado", await eventually(async () => (await one("services", { id: serviceId }))[0]?.is_active === false));
    await page.goto(url("/servicos"));
    const row = page.locator("li", { hasText: "Corte E2E" });
    check("lista mostra o serviço como Inativo", /inativo/i.test(await row.textContent()));
    await row.getByRole("button", { name: /Reativar/ }).click();
    check("botão de ação da lista reativa o serviço", await eventually(async () => (await one("services", { id: serviceId }))[0]?.is_active === true));
    await row.getByRole("button", { name: /Desativar/ }).click();
    await eventually(async () => (await one("services", { id: serviceId }))[0]?.is_active === false);

    await page.goto(url("/profissionais/novo"));
    await tab("Serviços").click();
    await page.getByText("Nenhum serviço ativo").waitFor();
    check("serviço inativo não aparece para vincular ao profissional", true);
  });

  // ---------- celular ----------
  await flow("celular (390 px): sem rolagem lateral", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/servicos", "/servicos/novo", `/servicos/${serviceId}`, "/profissionais", "/profissionais/novo", `/profissionais/${newBarberId}`]) {
      await page.goto(url(path));
      await page.waitForLoadState("networkidle").catch(() => {});
      const extra = await overflowX();
      check(`${path.replace(serviceId ?? "x", ":id").replace(newBarberId ?? "x", ":id")} cabe na tela`, extra <= 1, `sobra ${extra}px`);
    }
    await page.setViewportSize({ width: 1366, height: 900 });
  });

  check("nenhum erro de JavaScript no navegador durante os fluxos", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} catch (err) {
  failures++;
  console.error("\nErro inesperado:", err.message ?? err);
} finally {
  // ---------- limpeza ----------
  await browser?.close().catch(() => {});
  if (created.unitId) {
    const files = await admin.storage.from("service-images").list(created.unitId).catch(() => null);
    const names = (files?.data ?? []).map((f) => `${created.unitId}/${f.name}`);
    if (names.length) await admin.storage.from("service-images").remove(names).catch(() => {});
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  if (created.unitId) await admin.from("units").delete().eq("id", created.unitId);
  console.log(`\n${total - failures}/${total} verificações passaram.`);
  process.exit(failures ? 1 : 0);
}

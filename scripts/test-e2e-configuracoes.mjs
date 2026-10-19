// Teste PONTA A PONTA (navegador de verdade) das Configurações da barbearia.
//
// Cria duas unidades e usuários temporários (recepção A, recepção B, barbeiro e admin),
// abre o app no Edge/Chrome instalado e percorre os fluxos reais: abas, validações, salvar
// tudo (nome, CNPJ, telefones, endereço, horário, agenda), logo e capa (envio ao Storage),
// remoção da logo, aviso de serviços que não fecham com a linha da agenda, acessos barrados
// e telas no celular. Confere no banco o que foi gravado e apaga tudo que criou no fim.
//
// Uso: npm run test:e2e:configuracoes     (app em http://localhost:3000, com `npm run dev` rodando)
//      APP_URL=http://localhost:3001 npm run test:e2e:configuracoes
//      HEADED=1 npm run test:e2e:configuracoes   (abre a janela para acompanhar)
import { mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright-core";
import { adminClient, randomPassword, upsertUser } from "./_lib.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = adminClient();
const tag = Date.now().toString(36);
const SLUG_A = `teste-e2e-cfg-a-${tag}`;
const SLUG_B = `teste-e2e-cfg-b-${tag}`;
const NAME_A = `E2E Config A ${tag}`;
const SHOTS = ".e2e-artifacts";
const created = { users: [], unitIds: [] };
let total = 0;
let failures = 0;

function check(name, ok, extra = "") {
  total++;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok    " : "FALHOU"} ${name} ${ok ? "" : extra}`);
}

// ---------- imagem de teste (PNG gerado aqui) ----------
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

// ---------- ajudantes ----------
let page;
const urlA = (path = "/configuracoes") => `${APP}/u/${SLUG_A}${path}`;
const notice = (text) => page.getByRole("status").filter({ hasText: text });
const tabBtn = (id) => page.locator(`#unit-tab-${id}`);
const unitRow = async () => (await admin.from("units").select("*").eq("id", unitA.id).single()).data;
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
async function loginAs(pg, email, password, to) {
  await pg.goto(`${APP}/entrar`);
  await pg.locator("#email").fill(email);
  await pg.locator("#password").fill(password);
  await pg.getByRole("button", { name: "Entrar" }).click();
  await pg.waitForURL(to);
}
async function save() {
  await page.getByRole("button", { name: /Salvar configurações/ }).click();
}
async function pickSlot(label) {
  await page.locator("#slot").click();
  await page.getByRole("option", { name: label }).click();
}
const publicOk = async (bucket, path) => (await fetch(admin.storage.from(bucket).getPublicUrl(path).data.publicUrl)).status === 200;
const inBucket = async (bucket, path) => {
  const [folder, file] = path.split("/");
  const { data } = await admin.storage.from(bucket).list(folder);
  return (data ?? []).some((f) => f.name === file);
};

let browser;
let unitA;
try {
  // ---------- preparação (service_role) ----------
  const mkUnit = async (slug, name, extra = {}) => {
    const { data, error } = await admin.from("units").insert({ slug, name, ...extra }).select().single();
    if (error) throw error;
    created.unitIds.push(data.id);
    return data;
  };
  // Unidade "antiga": só endereço e telefone em texto livre (como as criadas pelo painel da rede).
  unitA = await mkUnit(SLUG_A, NAME_A, { address: "Rua Antiga, 1 - Centro", phone: "(11) 4002-8922" });
  const unitB = await mkUnit(SLUG_B, `E2E Config B ${tag}`);

  const mkUser = async (key, role, unit) => {
    const email = `e2e-${key}-${tag}@donguillermo.dev`;
    const password = randomPassword();
    const u = await upsertUser(admin, { email, password, fullName: `Pessoa ${key}` });
    created.users.push(u.id);
    const { error } = await admin.from("unit_members").insert({ user_id: u.id, unit_id: unit?.id ?? null, role });
    if (error) throw error;
    return { id: u.id, email, password };
  };
  const recepA = await mkUser("recepa", "recepcao", unitA);
  const recepB = await mkUser("recepb", "recepcao", unitB);
  const barbA = await mkUser("barba", "barbeiro", unitA);
  const adm = await mkUser("adm", "admin_rede", null);

  browser = await chromium.launch({ channel: process.env.BROWSER ?? "msedge", headless: !process.env.HEADED });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(120_000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const NEW_NAME = `Don Guillermo ${tag}`;
  const CNPJ = "11222333000181";

  await flow("login e abertura", async () => {
    await loginAs(page, recepA.email, recepA.password, /\/u\/.+\/agenda/);
    await page.getByRole("link", { name: "Configurações", exact: true }).click();
    await page.waitForURL(/\/configuracoes/);
    await page.getByRole("heading", { name: "Configurações" }).waitFor();
    check("recepção abre Configurações pelo menu", true);
    check("três abas: Identidade, Contato e Funcionamento", (await page.getByRole("tab").count()) === 3);
    check("nome atual vem preenchido", (await page.locator("#name").inputValue()) === NAME_A);
    check("sem logo: ícone no lugar e botão 'Escolher logo'", (await page.locator("button", { hasText: "Escolher logo" }).count()) === 1);
    check("sem capa: botão 'Escolher capa'", (await page.locator("button", { hasText: "Escolher capa" }).count()) === 1);
    await shot("cfg-identidade");
  });

  await flow("unidade antiga: telefone e endereço de antes", async () => {
    await tabBtn("contato").click();
    check("telefone antigo vira a primeira linha da lista", (await page.locator('input[id^="phone-number-"]').first().inputValue()) === "(11) 4002-8922");
    check("rótulo padrão 'Recepção'", (await page.locator('input[id^="phone-label-"]').first().inputValue()) === "Recepção");
    check("lembrete do endereço antigo", (await page.getByText("Rua Antiga, 1 - Centro").count()) >= 1);
    await shot("cfg-contato");
    await tabBtn("funcionamento").click();
    check("agenda padrão de 30 minutos", (await page.locator("#slot").innerText()).includes("30 minutos"));
    await shot("cfg-funcionamento");
  });

  await flow("validações", async () => {
    await tabBtn("identidade").click();
    await page.locator("#name").fill("");
    await page.locator("#cnpj").fill("11222333000182");
    check("máscara do CNPJ", (await page.locator("#cnpj").inputValue()) === "11.222.333/0001-82", await page.locator("#cnpj").inputValue());
    await page.locator("#cnpj").blur();
    await page.getByText("CNPJ inválido. Confira os números.").waitFor();
    check("CNPJ inválido: aviso ao sair do campo", true);
    await tabBtn("contato").click();
    await page.locator('input[id^="phone-label-"]').first().fill("");
    await save();
    await page.getByText("Confira os campos destacados.").first().waitFor();
    check("erro geral aparece", true);
    await tabBtn("identidade").waitFor();
    check("aba com erro mostra o ponto de aviso (Identidade e Contato)", (await tabBtn("identidade").locator("span").count()) >= 1);
    await page.getByText("Informe o nome da barbearia.").waitFor();
    check("nome vazio: mensagem no campo", true);
    await page.getByText("CNPJ inválido. Confira os números.").first().waitFor();
    check("CNPJ inválido: mensagem do servidor", true);
    await tabBtn("contato").click();
    await page.getByText("Dê um nome ao telefone (ex.: Recepção).").waitFor();
    check("telefone sem nome: mensagem na linha certa", true);
    const row = await unitRow();
    check("nada foi gravado", row.name === NAME_A && row.cnpj === null);
    await shot("cfg-erros");
  });

  await flow("salvar tudo", async () => {
    await page.goto(urlA());
    await page.locator("#name").fill(NEW_NAME);
    await page.locator("#cnpj").fill(CNPJ);

    await tabBtn("contato").click();
    await page.locator('input[id^="phone-label-"]').first().fill("Recepção");
    await page.getByRole("button", { name: "Adicionar telefone" }).click();
    await page.locator('input[id^="phone-label-"]').nth(1).fill("WhatsApp");
    await page.locator('input[id^="phone-number-"]').nth(1).fill("11912345678");
    check("máscara do telefone na lista", (await page.locator('input[id^="phone-number-"]').nth(1).inputValue()) === "(11) 91234-5678");
    await page.getByRole("switch", { name: "WhatsApp" }).nth(1).check({ force: true });
    // O CEP preenche rua, bairro e cidade (consulta feita pelo servidor); depois ajustamos à mão.
    await page.locator("#cep").fill("09750000");
    await page.waitForFunction(() => document.querySelector("#street")?.value, null, { timeout: 15_000 }).catch(() => {});
    check("CEP preenche a rua pelo servidor (ViaCEP)", (await page.locator("#street").inputValue()) !== "", "sem resposta do ViaCEP");
    await page.locator("#street").fill("Av. Kennedy");
    await page.locator("#streetNumber").fill("700");
    await page.locator("#complement").fill("Loja 12");
    await page.locator("#neighborhood").fill("Jardim do Mar");
    await page.locator("#city").fill("São Bernardo do Campo");
    await page.locator("#state").fill("sp");

    await tabBtn("funcionamento").click();
    await page.locator('input[name="hours_mon_open"]').fill("09:00");
    await page.locator('input[name="hours_mon_close"]').fill("19:00");
    await page.getByRole("button", { name: "Segunda a sexta" }).click();
    await page.getByRole("button", { name: "Sábado" }).click();
    await page.locator('input[name="hours_sat_open"]').fill("09:00");
    await page.locator('input[name="hours_sat_close"]').fill("16:00");
    await page.getByRole("button", { name: "Domingo" }).click();
    await page.locator('input[name="hours_sun_closed"]').check({ force: true });
    await pickSlot("15 minutos");

    await save();
    await notice("Configurações salvas").waitFor();
    check("aviso 'Configurações salvas'", true);

    const row = await unitRow();
    check("nome gravado", row.name === NEW_NAME, row.name);
    check("CNPJ gravado sem máscara", row.cnpj === CNPJ, row.cnpj);
    check("telefones gravados (só dígitos, rótulo e WhatsApp)", JSON.stringify(row.phones) === JSON.stringify([
      { label: "Recepção", number: "1140028922", whatsapp: false },
      { label: "WhatsApp", number: "11912345678", whatsapp: true },
    ]), JSON.stringify(row.phones));
    check("telefone principal em texto (primeiro da lista)", row.phone === "(11) 4002-8922", row.phone);
    check("endereço em campos gravado", row.street === "Av. Kennedy" && row.street_number === "700" && row.complement === "Loja 12" && row.city === "São Bernardo do Campo" && row.state === "SP");
    check("endereço em uma linha composto", row.address?.startsWith("Av. Kennedy, 700 - Loja 12, Jardim do Mar, São Bernardo do Campo/SP"), row.address);
    check("horário: segunda a sexta, sábado e domingo fechado", row.opening_hours?.mon?.open === "09:00" && row.opening_hours?.fri?.close === "19:00" && row.opening_hours?.sat?.close === "16:00" && row.opening_hours?.sun?.closed === true, JSON.stringify(row.opening_hours));
    check("agenda de 15 minutos", row.slot_minutes === 15, String(row.slot_minutes));
    check("slug e situação não mudaram", row.slug === SLUG_A && row.is_active === true);
    check("nome novo aparece no menu lateral", (await page.getByText(NEW_NAME).count()) >= 1);
    await shot("cfg-salvo");

    await page.goto(urlA());
    check("depois de recarregar, o nome vem salvo", (await page.locator("#name").inputValue()) === NEW_NAME);
    check("CNPJ vem com máscara", (await page.locator("#cnpj").inputValue()) === "11.222.333/0001-81");
    await tabBtn("contato").click();
    check("duas linhas de telefone", (await page.locator('input[id^="phone-number-"]').count()) === 2);
    check("o lembrete do endereço antigo some", (await page.getByText("Endereço cadastrado antes").count()) === 0);
    await tabBtn("funcionamento").click();
    check("agenda mostra 15 minutos", (await page.locator("#slot").innerText()).includes("15 minutos"));
  });

  await flow("logo e capa", async () => {
    await page.goto(urlA());
    await page.getByLabel("Escolher logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: makePng(900, 500) });
    await page.getByRole("button", { name: "Trocar logo" }).waitFor();
    check("logo enviada (sem janela de recorte)", (await page.getByRole("dialog").count()) === 0);
    check("logo não tem 'Reposicionar' (sem recorte); a capa ainda não tem arquivo", (await page.getByRole("button", { name: "Reposicionar" }).count()) === 0);

    await page.getByLabel("Escolher capa").setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: makePng(1600, 1200) });
    await page.getByRole("dialog", { name: /Ajustar capa/ }).waitFor();
    check("capa abre a janela de ajuste", true);
    await shot("cfg-capa-recorte");
    await page.getByRole("button", { name: "Usar capa" }).click();
    await page.getByRole("button", { name: "Trocar capa" }).waitFor();
    check("capa enviada", true);

    await save();
    await notice("Configurações salvas").waitFor();
    const row = await unitRow();
    const pat = new RegExp(`^${unitA.id}/[0-9a-f-]{36}\\.(webp|jpg|png)$`);
    check("caminho da logo na pasta da unidade", pat.test(row.logo_path ?? ""), row.logo_path);
    check("caminho da capa na pasta da unidade", pat.test(row.cover_path ?? ""), row.cover_path);
    check("logo existe no Storage", await inBucket("unit-assets", row.logo_path));
    check("capa existe no Storage", await inBucket("unit-assets", row.cover_path));
    check("logo abre por URL pública", await publicOk("unit-assets", row.logo_path));
    check("capa abre por URL pública", await publicOk("unit-assets", row.cover_path));

    // O tamanho da capa final: 16:9, no máximo 1280 px de largura
    const dims = await page.evaluate(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, admin.storage.from("unit-assets").getPublicUrl(row.cover_path).data.publicUrl);
    check("capa final em 16:9 e até 1280 px", dims[0] <= 1280 && Math.abs(dims[0] / dims[1] - 16 / 9) < 0.02, dims.join("x"));
    const logoDims = await page.evaluate(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, admin.storage.from("unit-assets").getPublicUrl(row.logo_path).data.publicUrl);
    check("logo reduzida sem cortar (proporção mantida, até 512 px)", Math.max(...logoDims) <= 512 && Math.abs(logoDims[0] / logoDims[1] - 900 / 500) < 0.03, logoDims.join("x"));
    await shot("cfg-marca");

    // Trocar a capa apaga o arquivo antigo
    const oldCover = row.cover_path;
    await page.goto(urlA());
    await page.getByLabel("Escolher capa").setInputFiles({ name: "capa2.png", mimeType: "image/png", buffer: makePng(1280, 720) });
    await page.getByRole("button", { name: "Usar capa" }).click();
    await page.getByRole("button", { name: "Trocar capa" }).waitFor();
    await save();
    await notice("Configurações salvas").waitFor();
    const after = await unitRow();
    check("capa nova gravada com outro nome", after.cover_path !== oldCover && !!after.cover_path);
    check("capa antiga removida do Storage", await eventually(async () => !(await inBucket("unit-assets", oldCover))));

    // Remover a logo
    const oldLogo = after.logo_path;
    await page.goto(urlA());
    await page.getByRole("button", { name: "Remover" }).first().click();
    await save();
    await notice("Configurações salvas").waitFor();
    const gone = await unitRow();
    check("logo removida no banco", gone.logo_path === null);
    check("arquivo da logo removido do Storage", await eventually(async () => !(await inBucket("unit-assets", oldLogo))));
    check("a capa continua", gone.cover_path === after.cover_path);
  });

  await flow("agenda x duração dos serviços", async () => {
    await admin.from("services").insert([
      { unit_id: unitA.id, name: `Corte ${tag}`, category: "cabelo", duration_minutes: 30, price_cents: 5000 },
      { unit_id: unitA.id, name: `Combo ${tag}`, category: "combo", duration_minutes: 45, price_cents: 9000 },
    ]);
    await page.goto(urlA());
    await tabBtn("funcionamento").click();
    await pickSlot("30 minutos");
    check("30 min: 1 serviço de 45 min não fecha", (await page.getByText(/1 serviço ativo tem duração que não é múltipla de 30 min/).count()) === 1);
    await pickSlot("15 minutos");
    check("15 min: todos fecham", (await page.getByText("Todos os serviços ativos fecham certinho").count()) === 1);
    await pickSlot("20 minutos");
    check("20 min: os dois não fecham", (await page.getByText(/2 serviços ativos têm duração que não é múltipla de 20 min/).count()) === 1);
    await shot("cfg-agenda-aviso");
    await pickSlot("1 hora");
    await save();
    await notice("Configurações salvas").waitFor();
    check("agenda de 1 hora gravada", (await unitRow()).slot_minutes === 60);
    await admin.from("services").delete().eq("unit_id", unitA.id);
  });

  await flow("acessos", async () => {
    const ctxB = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
    const pb = await ctxB.newPage();
    await loginAs(pb, recepB.email, recepB.password, /\/u\/.+\/agenda/);
    await pb.goto(urlA());
    await pb.waitForURL(/sem-acesso/);
    check("recepção de outra unidade é barrada", true);
    await ctxB.close();

    const ctxC = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
    const pc = await ctxC.newPage();
    await loginAs(pc, barbA.email, barbA.password, /\/u\/.+\/minha-agenda/);
    await pc.goto(urlA());
    await pc.waitForURL(/sem-acesso/);
    check("barbeiro é barrado", true);
    check("barbeiro não vê o item Configurações no menu", (await pc.goto(urlA("/minha-agenda")) && (await pc.getByRole("link", { name: "Configurações", exact: true }).count()) === 0));
    await ctxC.close();

    const ctxD = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
    const pd = await ctxD.newPage();
    pd.setDefaultTimeout(60_000);
    await loginAs(pd, adm.email, adm.password, /\/admin/);
    await pd.goto(`${APP}/admin/unidades/${SLUG_A}`);
    await pd.getByRole("link", { name: "Abrir configurações da unidade" }).waitFor();
    check("painel da rede aponta para as configurações da unidade", true);
    check("painel da rede não tem mais o formulário de dados duplicado", (await pd.getByRole("button", { name: "Salvar alterações" }).count()) === 0);
    await pd.getByRole("link", { name: "Abrir configurações da unidade" }).click();
    await pd.waitForURL(/\/configuracoes/);
    check("admin abre as configurações de qualquer unidade", (await pd.locator("#name").inputValue()) === NEW_NAME);
    await ctxD.close();
  });

  await flow("celular (390 px): sem rolagem lateral", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(urlA());
    await page.waitForLoadState("networkidle").catch(() => {});
    for (const id of ["identidade", "contato", "funcionamento"]) {
      await tabBtn(id).click();
      const extra = await overflowX();
      check(`aba ${id} cabe na tela`, extra <= 1, `sobra ${extra}px`);
      await shot(`cfg-celular-${id}`);
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
  for (const id of created.unitIds) {
    const { data: files } = await admin.storage.from("unit-assets").list(id);
    if (files?.length) await admin.storage.from("unit-assets").remove(files.map((f) => `${id}/${f.name}`)).catch(() => {});
    await admin.from("services").delete().eq("unit_id", id);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.unitIds) await admin.from("units").delete().eq("id", id);
  console.log(`\n${total - failures}/${total} verificações passaram.`);
  process.exit(failures ? 1 : 0);
}

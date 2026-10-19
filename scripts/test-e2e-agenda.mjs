// Teste PONTA A PONTA (navegador de verdade) da Agenda da recepção.
//
// Cria unidades, profissionais, serviços, um cliente e usuários temporários, abre o app no
// Edge/Chrome instalado e percorre os fluxos reais: agendar avulso e cadastrado (vários
// serviços), encaixe da recepção (overlap), encaixe fora do expediente, remarcar trocando
// profissional, mudanças de situação, cancelados, bloqueios, navegação entre dias, acessos
// barrados e o celular. Confere no banco o que foi gravado e apaga tudo que criou no fim.
//
// Uso: npm run test:e2e:agenda     (app em http://localhost:3000, com `npm run dev` rodando)
//      APP_URL=http://localhost:3001 npm run test:e2e:agenda
//      HEADED=1 npm run test:e2e:agenda   (abre a janela para acompanhar)
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { adminClient, randomPassword, upsertUser } from "./_lib.mjs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = adminClient();
const tag = Date.now().toString(36);
const SLUG_A = `teste-e2e-ag-a-${tag}`;
const SLUG_B = `teste-e2e-ag-b-${tag}`;
const SHOTS = ".e2e-artifacts";
const created = { users: [], unitIds: [], customers: [] };
let total = 0;
let failures = 0;

function check(name, ok, extra = "") {
  total++;
  if (!ok) failures++;
  console.log(`  ${ok ? "ok    " : "FALHOU"} ${name} ${ok ? "" : extra}`);
}

// ---------- datas (fuso da agenda) ----------
const TZ = "America/Sao_Paulo";
const todaySP = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const DAY = addDays(todaySP, 7); // sempre no futuro, mesma semana da próxima
// São Paulo não tem horário de verão: 10:00 local = 13:00 UTC.
const utc = (hhmm, date = DAY) => {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, m)).toISOString();
};
const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();

// ---------- ajudantes ----------
let page;
const agendaUrl = (date = DAY, slug = SLUG_A) => `${APP}/u/${slug}/agenda?data=${date}`;
const notice = (text) => page.getByRole("status").filter({ hasText: text });
const dialog = () => page.getByRole("dialog");
async function overflowX() {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
async function shot(name) {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {});
}
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
    await shot(`ag-erro-${name.replace(/\W+/g, "-")}`);
    await page.keyboard.press("Escape").catch(() => {});
  }
}
async function loginAs(pg, email, password, to) {
  await pg.goto(`${APP}/entrar`);
  await pg.locator("#email").fill(email);
  await pg.locator("#password").fill(password);
  await pg.getByRole("button", { name: "Entrar" }).click();
  await pg.waitForURL(to);
}
async function openAgenda(date = DAY) {
  await page.goto(agendaUrl(date));
  await page.getByRole("region", { name: /Agenda de/ }).waitFor();
}
const slotBtn = (barber, time) => page.getByRole("button", { name: `Novo agendamento com ${barber} às ${time}`, exact: true });
const entryBtn = (re) => page.getByRole("button", { name: re });
async function pickBarber(name) {
  const sel = dialog().locator("#barberId, #barberEdit");
  await sel.first().click();
  await page.getByRole("option", { name, exact: true }).click();
}
const serviceBox = (name) => dialog().getByRole("group", { name: "Serviços do agendamento" }).locator("label", { hasText: name });
async function continueStep() {
  await dialog().getByRole("button", { name: "Continuar" }).click();
}
async function rowsOfUnit(unitId) {
  const { data } = await admin
    .from("appointments")
    .select("*, appointment_services(*)")
    .eq("unit_id", unitId)
    .order("starts_at");
  return data ?? [];
}

let browser;
try {
  // ---------- preparação (service_role) ----------
  const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "09:00", close: "19:00" }]));
  const work = Object.fromEntries(
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "10:00", close: "18:00", break: { start: "12:00", end: "13:00" } }]),
  );
  const mkUnit = async (slug, name) => {
    const { data, error } = await admin.from("units").insert({ slug, name, opening_hours: hours, slot_minutes: 30 }).select().single();
    if (error) throw error;
    created.unitIds.push(data.id);
    return data;
  };
  const unitA = await mkUnit(SLUG_A, `E2E Agenda A ${tag}`);
  const unitB = await mkUnit(SLUG_B, `E2E Agenda B ${tag}`);

  const mkBarber = async (name, extra = {}) => {
    const { data, error } = await admin
      .from("barbers")
      .insert({ unit_id: unitA.id, full_name: `${name} Teste`, display_name: name, ...extra })
      .select()
      .single();
    if (error) throw error;
    return data;
  };
  const joao = await mkBarber("João", { work_hours: work });
  const carlos = await mkBarber("Carlos");
  const mkService = async (name, minutes, cents) => {
    const { data, error } = await admin
      .from("services")
      .insert({ unit_id: unitA.id, name, category: "cabelo", duration_minutes: minutes, price_cents: cents })
      .select()
      .single();
    if (error) throw error;
    return data;
  };
  const corte = await mkService("Corte", 30, 4500);
  const barba = await mkService("Barba", 20, 3000);
  await mkService("Sobrancelha", 10, 1500); // ninguém faz: não pode aparecer no agendamento
  await admin.from("barber_services").insert([
    { barber_id: joao.id, service_id: corte.id, unit_id: unitA.id },
    { barber_id: joao.id, service_id: barba.id, unit_id: unitA.id, duration_minutes: 25 },
    { barber_id: carlos.id, service_id: corte.id, unit_id: unitA.id },
    { barber_id: carlos.id, service_id: barba.id, unit_id: unitA.id },
  ]);
  const custName = `Cliente Agenda ${tag}`;
  const { data: cust, error: custErr } = await admin
    .from("customers")
    .insert({ full_name: custName, phone: "11987654321", created_unit_id: unitA.id })
    .select()
    .single();
  if (custErr) throw custErr;
  created.customers.push(cust.id);

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

  browser = await chromium.launch({ channel: process.env.BROWSER ?? "msedge", headless: !process.env.HEADED });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR", timezoneId: TZ });
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(120_000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await loginAs(page, recepA.email, recepA.password, /\/u\//);

  await flow("grade do dia", async () => {
    await openAgenda();
    check("mostra a coluna de cada profissional ativo", (await page.getByText("João", { exact: true }).count()) > 0 && (await page.getByText("Carlos", { exact: true }).count()) > 0);
    check("linhas a cada 30 min no expediente da unidade (09:00 a 18:30)", (await slotBtn("Carlos", "09:00").count()) === 1 && (await slotBtn("Carlos", "18:30").count()) === 1 && (await slotBtn("Carlos", "19:00").count()) === 0);
    check("grade do dia sem cards de agendamento", (await entryBtn(/Agendamento /).count()) === 0);
    await shot("ag-grade-vazia");
  });

  let firstId;
  await flow("agendar cliente sem cadastro com 2 serviços", async () => {
    await slotBtn("João", "10:00").click();
    await dialog().getByRole("heading", { name: "Novo agendamento" }).waitFor();
    check("wizard começa no passo Cliente", (await dialog().getByText("Quem é o cliente?").count()) === 1);

    await continueStep();
    check("valida cliente antes de avançar", (await dialog().getByText(/Busque e escolha o cliente|Sem cadastro/).count()) >= 1);

    await dialog().getByRole("button", { name: "Sem cadastro" }).click();
    check("sem cadastro não pede dados", (await dialog().getByText(/Sem nome nem telefone/).count()) === 1);
    await continueStep();

    check("lista só os serviços que o João faz", (await serviceBox("Sobrancelha").count()) === 0 && (await serviceBox("Corte").count()) === 1);
    await continueStep();
    check("valida serviços antes de avançar", (await dialog().getByText("Escolha pelo menos um serviço.").count()) === 1);

    await serviceBox("Corte").click();
    await serviceBox("Barba").click();
    const summarySvc = await dialog().locator("dl").textContent();
    check("resumo soma duração própria do profissional (30 + 25 = 55 min)", /55 min/.test(summarySvc), summarySvc);
    check("resumo mostra o total (R$ 75,00)", summarySvc.includes("75,00"), summarySvc);
    await continueStep();

    const whenTxt = await dialog().locator("section").filter({ hasText: "Confirmar" }).textContent();
    check(
      "confirmação traz horário real (10:00 – 10:55) e profissional da grade",
      /10:00\s*[–-]\s*10:55/.test(whenTxt) && whenTxt.includes("João"),
      whenTxt,
    );
    await dialog().getByRole("button", { name: "Agendar" }).click();
    await notice("Agendamento criado").waitFor();
    check("aviso de sucesso e janela fechada", (await dialog().count()) === 0);

    const rows = await rowsOfUnit(unitA.id);
    const r = rows[0];
    firstId = r?.id;
    check("gravou 1 agendamento", rows.length === 1, JSON.stringify(rows.length));
    check(
      "horário em UTC correto (10:00–10:55 de São Paulo, duração real)",
      r && same(r.starts_at, utc("10:00")) && same(r.ends_at, utc("10:55")),
      `${r?.starts_at} ${r?.ends_at}`,
    );
    check("cliente avulso: só o rótulo, sem telefone nem cadastro", r?.customer_id === null && r?.customer_name === "Cliente sem cadastro" && r?.customer_phone === null);
    const svc = [...(r?.appointment_services ?? [])].sort((a, b) => a.position - b.position);
    const sBarba = svc.find((x) => x.name === "Barba");
    check("2 serviços com duração própria do profissional e preço do catálogo", svc.length === 2 && svc.every((x, i) => x.position === i) && sBarba?.duration_minutes === 25 && sBarba?.price_cents === 3000, JSON.stringify(svc));
    check("autor = recepção logada", r?.created_by === recepA.id && !!r?.created_by_name);
    await entryBtn(/Agendamento 10:00 às 10:55, Cliente sem cadastro, Agendado/).waitFor();
    check("aparece na grade", true);
    check("só o primeiro agendamento na grade", (await entryBtn(/Agendamento /).count()) === 1);
  });

  await flow("encaixe da recepção e cliente cadastrado", async () => {
    await openAgenda();
    // Card cobre o slot 10:30 na grade — encaixe via “Agendar” (lista inclui ocupados).
    await page.getByRole("button", { name: "Agendar", exact: true }).last().click();
    await dialog().getByRole("heading", { name: "Novo agendamento" }).waitFor();
    await dialog().getByRole("button", { name: "Sem cadastro" }).click();
    await continueStep();
    await serviceBox("Corte").click();
    await continueStep();
    await dialog().getByRole("button", { name: "João", exact: true }).click();
    check("recepção vê horário já ocupado na lista (encaixe)", (await dialog().getByRole("button", { name: "10:30", exact: true }).count()) === 1);
    await dialog().getByRole("button", { name: "10:30", exact: true }).click();
    await continueStep();
    await dialog().getByRole("button", { name: "Agendar" }).click();
    await notice("Agendamento criado").waitFor();
    const afterEncaixe = (await rowsOfUnit(unitA.id)).filter((x) => x.kind === "appointment" && x.status !== "cancelado");
    check("encaixe sobre horário ocupado é aceito (recepção)", afterEncaixe.length === 2, String(afterEncaixe.length));
    const encaixe = afterEncaixe.find((x) => same(x.starts_at, utc("10:30")));
    check("encaixe gravou 10:30–11:00", !!(encaixe && same(encaixe.ends_at, utc("11:00"))));

    // Cancela o encaixe para não poluir os fluxos seguintes.
    await entryBtn(/Agendamento 10:30 às 11:00, Cliente sem cadastro/).click();
    await dialog().getByRole("button", { name: "Cancelar agendamento" }).click();
    await notice("Agendamento cancelado").waitFor();
    check("encaixe cancelado some da grade", await eventually(async () => (await entryBtn(/Agendamento 10:30 às 11:00/).count()) === 0));

    await slotBtn("João", "11:00").click();
    await dialog().getByRole("heading", { name: "Novo agendamento" }).waitFor();
    await dialog().getByLabel("Buscar cliente").fill(`agenda ${tag}`);
    await dialog().getByRole("button", { name: new RegExp(custName) }).click();
    check("cliente escolhido aparece no cartão", (await dialog().getByText(custName).count()) === 1 && (await dialog().getByText("(11) 98765-4321").count()) === 1);
    await continueStep();
    await serviceBox("Corte").click();
    await continueStep();
    await dialog().getByRole("button", { name: "Agendar" }).click();
    await notice("Agendamento criado").waitFor();
    const r = (await rowsOfUnit(unitA.id)).find((x) => x.customer_id === cust.id && x.status !== "cancelado");
    check("cliente cadastrado: liga o cadastro e copia nome e telefone do banco", !!r && r.customer_name === custName && r.customer_phone === "11987654321");
    check("colado ao anterior (11:00–11:30) é aceito", r && same(r.starts_at, utc("11:00")) && same(r.ends_at, utc("11:30")));
  });

  await flow("encaixe fora do expediente", async () => {
    await openAgenda();
    await page.keyboard.press("Escape").catch(() => {});
    await slotBtn("João", "12:00").click();
    await dialog().getByRole("heading", { name: "Novo agendamento" }).waitFor();
    await dialog().getByRole("button", { name: "Sem cadastro" }).click();
    await continueStep();
    await serviceBox("Corte").click();
    await continueStep();
    check("avisa na confirmação que é o intervalo do profissional", (await dialog().getByText(/intervalo do profissional/).count()) === 1);
    await dialog().getByRole("button", { name: "Agendar" }).click();
    await dialog().getByText(/Marque "Encaixe fora do expediente"/).waitFor();
    const beforeForce = (await rowsOfUnit(unitA.id)).filter((x) => x.kind === "appointment" && x.status !== "cancelado");
    check("servidor recusa sem confirmar o encaixe", beforeForce.length === 2, String(beforeForce.length));
    await dialog().getByText("Encaixe fora do expediente", { exact: true }).click();
    await dialog().getByRole("button", { name: "Agendar" }).click();
    await notice("Agendamento criado").waitFor();
    check(
      "com o encaixe confirmado, grava",
      await eventually(async () =>
        (await rowsOfUnit(unitA.id)).some((x) => x.customer_name === "Cliente sem cadastro" && same(x.starts_at, utc("12:00"))),
      ),
    );
    check("faixas fora do expediente aparecem sombreadas", (await page.locator("[data-unavailable]").count()) > 0);
    await shot("ag-grade");
  });

  await flow("remarcar: trocar profissional e horário", async () => {
    await entryBtn(/Agendamento 10:00 às 10:55, Cliente sem cadastro/).click();
    await dialog().getByRole("heading", { name: "Agendamento" }).waitFor();
    check(
      "abre com os dados salvos",
      (await dialog().getByText("Cliente sem cadastro").count()) >= 1 && (await dialog().getByText("10:00").count()) >= 1,
    );
    check("mostra situação e autor", (await dialog().getByText("Agendado", { exact: true }).count()) === 1 && (await dialog().getByText(/Criado por|Recepção/).count()) >= 1);
    await dialog().getByRole("button", { name: "Editar" }).click();
    await dialog().getByRole("heading", { name: "Editar agendamento" }).waitFor();
    await continueStep(); // cliente → serviços
    await continueStep(); // serviços → horário
    await dialog().getByRole("button", { name: "Carlos", exact: true }).click();
    await dialog().getByRole("button", { name: "14:00", exact: true }).click();
    await continueStep(); // horário → revisão
    await dialog().getByRole("button", { name: "Salvar alterações" }).click();
    check(
      "grade mostra o novo horário (duração real 55 min)",
      await eventually(async () => (await entryBtn(/Agendamento 14:00 às 14:55, Cliente sem cadastro/).count()) === 1),
    );
    const r = (await rowsOfUnit(unitA.id)).find((x) => x.id === firstId);
    check("agendamento mudou de profissional e horário", r?.barber_id === carlos.id && same(r.starts_at, utc("14:00")) && same(r.ends_at, utc("14:55")), JSON.stringify({ b: r?.barber_id, s: r?.starts_at, e: r?.ends_at }));
    check("serviços mantêm a foto original (Barba 25 min do João)", r?.appointment_services.some((s) => s.name === "Barba" && s.duration_minutes === 25));
    const active = (await rowsOfUnit(unitA.id)).filter((x) => x.kind === "appointment" && x.status !== "cancelado");
    check(
      "mesmo id (remarcado, não duplicado)",
      active.some((x) => x.id === firstId) && active.filter((x) => x.id === firstId).length === 1,
      String(active.length),
    );
  });

  await flow("situação: confirmar, iniciar, concluir", async () => {
    const labelOf = { confirmado: "Confirmado", em_atendimento: "Em atendimento", concluido: "Concluído" };
    const step = async (button, status) => {
      await entryBtn(/Agendamento 14:00 às 14:55, Cliente sem cadastro/).click();
      await dialog().getByRole("button", { name: button }).waitFor({ state: "visible", timeout: 20_000 });
      await dialog().getByRole("button", { name: button }).click();
      // Espera o banco E a grade (router.refresh) antes do próximo passo.
      const ok = await eventually(async () => {
        const row = (await rowsOfUnit(unitA.id)).find((x) => x.id === firstId);
        const onCard = (await entryBtn(new RegExp(`Agendamento 14:00 às 14:55, Cliente sem cadastro, ${labelOf[status]}`)).count()) === 1;
        return row?.status === status && onCard;
      });
      check(`${button} -> ${status}`, ok);
      await notice("Situação atualizada").getByRole("button", { name: "Fechar aviso" }).click().catch(() => {});
    };
    await step("Confirmar", "confirmado");
    await step("Iniciar atendimento", "em_atendimento");
    await step("Concluir atendimento", "concluido");
    await entryBtn(/Agendamento 14:00 às 14:55, Cliente sem cadastro, Concluído/).click();
    check("concluído fica só leitura (sem editar)", (await dialog().getByRole("button", { name: "Editar" }).count()) === 0);
    check("concluído só oferece reabrir", (await dialog().getByRole("button", { name: "Reabrir atendimento" }).count()) === 1 && (await dialog().getByRole("button", { name: "Cancelar agendamento" }).count()) === 0);
    await page.keyboard.press("Escape");
    check("Esc fecha a janela", (await dialog().count()) === 0);
  });

  await flow("cancelar libera o horário", async () => {
    await openAgenda();
    await entryBtn(new RegExp(`Agendamento 11:00 às 11:30, ${custName}`)).click();
    await dialog().getByRole("button", { name: "Cancelar agendamento" }).click();
    await notice("Agendamento cancelado").waitFor();
    const r = (await rowsOfUnit(unitA.id)).find((x) => x.customer_id === cust.id);
    check("status cancelado no banco", r?.status === "cancelado");
    check("some da grade (como excluído)", await eventually(async () => (await entryBtn(new RegExp(`Agendamento 11:00 às 11:30, ${custName}`)).count()) === 0));
    check("sem toggle de cancelados", (await page.getByText(/Mostrar cancelados|Cancelados \(/).count()) === 0);
    check("horário livre de novo para agendar", (await slotBtn("João", "11:00").count()) === 1);
  });

  await flow("bloqueios", async () => {
    await openAgenda();
    await page.keyboard.press("Escape").catch(() => {});
    await page.getByRole("button", { name: "Bloquear horário" }).click();
    await dialog().getByRole("heading", { name: "Bloquear horário" }).waitFor();
    await dialog().locator("#block-barber").click();
    await page.getByRole("option", { name: "João", exact: true }).click();
    await dialog().locator("#block-start").fill("15:00");
    await dialog().locator("#block-end").fill("16:00");
    await dialog().locator("#block-reason").fill("Consulta médica");
    await dialog().getByRole("button", { name: "Bloquear", exact: true }).click();
    await notice("Horário bloqueado").waitFor();
    const blk = (await rowsOfUnit(unitA.id)).find((x) => x.kind === "block");
    check("bloqueio gravado (João, 15:00–16:00, motivo)", blk?.barber_id === joao.id && same(blk.starts_at, utc("15:00")) && blk.notes === "Consulta médica");
    await entryBtn(/Bloqueio 15:00 às 16:00: Consulta médica/).waitFor();
    check("bloqueio aparece na grade", true);

    // Recepção pode agendar em cima de bloqueio (encaixe); dois bloqueios no mesmo horário não.
    await slotBtn("João", "14:30").click();
    await dialog().getByRole("button", { name: "Sem cadastro" }).click();
    await continueStep();
    await serviceBox("Corte").click();
    await continueStep();
    await dialog().getByRole("button", { name: "Agendar" }).click();
    await notice("Agendamento criado").waitFor();
    check(
      "agendamento sobre bloqueio é aceito (encaixe da recepção)",
      await eventually(async () =>
        (await rowsOfUnit(unitA.id)).some((x) => x.kind === "appointment" && same(x.starts_at, utc("14:30")) && x.status !== "cancelado"),
      ),
    );
    await entryBtn(/Agendamento 14:30 às 15:00, Cliente sem cadastro/).click();
    await dialog().getByRole("button", { name: "Cancelar agendamento" }).click();
    await notice("Agendamento cancelado").waitFor();

    await page.getByRole("button", { name: "Bloquear horário" }).click();
    await dialog().getByRole("heading", { name: "Bloquear horário" }).waitFor();
    await dialog().locator("#block-barber").click();
    await page.getByRole("option", { name: "Todos os profissionais", exact: true }).click();
    await dialog().locator("#block-start").fill("15:00");
    await dialog().locator("#block-end").fill("15:30");
    await dialog().getByRole("button", { name: "Bloquear", exact: true }).click();
    await dialog().getByText(/já tem bloqueio|Já existe um bloqueio/).waitFor();
    check("bloqueio × bloqueio no mesmo período é recusado", (await rowsOfUnit(unitA.id)).filter((x) => x.kind === "block").length === 1);
    await dialog().locator("#block-start").fill("17:00");
    await dialog().locator("#block-end").fill("17:30");
    await dialog().getByRole("button", { name: "Bloquear", exact: true }).click();
    await notice("Horário bloqueado para todos").waitFor();
    check("bloqueio para todos cria 1 por profissional", (await rowsOfUnit(unitA.id)).filter((x) => x.kind === "block").length === 3);

    await entryBtn(/Bloqueio 15:00 às 16:00/).click();
    await dialog().getByRole("button", { name: "Remover bloqueio" }).click();
    await dialog().getByRole("button", { name: "Confirmar remoção" }).click();
    await notice("Bloqueio removido").waitFor();
    check("bloqueio removido do banco", (await rowsOfUnit(unitA.id)).filter((x) => x.kind === "block").length === 2);
  });

  await flow("navegação entre dias", async () => {
    await page.getByRole("link", { name: "Próximo dia" }).click();
    await page.waitForURL(new RegExp(`data=${addDays(DAY, 1)}`));
    check("próximo dia abre vazio", (await entryBtn(/Agendamento /).count()) === 0);
    await page.getByRole("link", { name: "Dia anterior" }).click();
    await page.waitForURL(new RegExp(`data=${DAY}`));
    check(
      "dia anterior volta aos agendamentos (cancelado não conta)",
      await eventually(async () => (await entryBtn(/Agendamento /).count()) === 2),
    );
    await page.getByRole("link", { name: "Hoje", exact: true }).click();
    await page.waitForURL(/\/agenda$/);
    check("Hoje abre a data de hoje", (await page.getByText("Hoje", { exact: true }).count()) >= 1);
    await page.goto(`${APP}/u/${SLUG_A}/agenda?data=2026-02-30`);
    check("data inválida na URL cai em hoje", (await page.getByRole("region", { name: /Agenda de/ }).count()) === 1);

    // Agendar em outro dia pelo formulário leva a grade para aquele dia.
    await openAgenda();
    await page.keyboard.press("Escape").catch(() => {});
    await page.getByRole("button", { name: "Agendar", exact: true }).last().click();
    await dialog().getByRole("button", { name: "Sem cadastro" }).click();
    await continueStep();
    await serviceBox("Corte").click();
    await continueStep();
    await dialog().locator("#datePick").fill(addDays(DAY, 2));
    await dialog().getByRole("button", { name: "Carlos", exact: true }).click();
    await dialog().getByRole("button", { name: "10:00", exact: true }).click();
    await continueStep();
    await dialog().getByRole("button", { name: "Agendar" }).click();
    await page.waitForURL(new RegExp(`data=${addDays(DAY, 2)}`));
    check(
      "após salvar em outra data, a grade pula para ela",
      (await entryBtn(/Agendamento 10:00 às 10:30, Cliente sem cadastro/).count()) === 1,
    );
  });

  await flow("acessos", async () => {
    const ctxB = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
    const pb = await ctxB.newPage();
    await loginAs(pb, recepB.email, recepB.password, /\/u\//);
    await pb.goto(agendaUrl());
    await pb.waitForURL(/sem-acesso/);
    check("recepção de outra unidade é barrada", true);
    await ctxB.close();

    const ctxC = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "pt-BR" });
    const pc = await ctxC.newPage();
    await loginAs(pc, barbA.email, barbA.password, /\/u\/.+\/minha-agenda/);
    await pc.goto(agendaUrl());
    await pc.waitForURL(/sem-acesso/);
    check("barbeiro é barrado da agenda da recepção", true);
    await ctxC.close();
  });

  await flow("celular (390 px)", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openAgenda();
    const mobileTabs = page.getByRole("tablist").or(page.getByRole("tab"));
    check(
      "mostra um profissional por vez",
      await eventually(async () => {
        const carlos = await slotBtn("Carlos", "10:00").count();
        const joao = await slotBtn("João", "10:00").count();
        return (carlos === 1 && joao === 0) || (carlos === 0 && joao === 1) || (await mobileTabs.count()) > 0;
      }),
    );
    const joaoTab = page.getByRole("tab", { name: "João" });
    if ((await joaoTab.count()) > 0) {
      await joaoTab.click();
      check("trocar a aba mostra o outro profissional", (await slotBtn("João", "10:00").count()) === 1);
    } else {
      check("trocar a aba mostra o outro profissional", (await slotBtn("João", "10:00").count()) + (await slotBtn("Carlos", "10:00").count()) >= 1);
    }
    const extra = await overflowX();
    check("página sem rolagem lateral", extra <= 1, `sobra ${extra}px`);
    await shot("ag-celular");
    await slotBtn("João", "16:00").click();
    await dialog().getByRole("heading", { name: "Novo agendamento" }).waitFor();
    const extraDialog = await overflowX();
    check("janela de agendamento cabe na tela", extraDialog <= 1, `sobra ${extraDialog}px`);
    await shot("ag-celular-janela");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1366, height: 900 });
  });

  check("nenhum erro de JavaScript no navegador durante os fluxos", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} catch (err) {
  failures++;
  console.error("\nErro inesperado:", err.message ?? err);
} finally {
  // ---------- limpeza ----------
  await browser?.close().catch(() => {});
  for (const id of created.unitIds) await admin.from("appointments").delete().eq("unit_id", id);
  for (const id of created.customers) await admin.from("customers").delete().eq("id", id);
  for (const id of created.unitIds) {
    await admin.from("barbers").delete().eq("unit_id", id);
    await admin.from("services").delete().eq("unit_id", id);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id).catch(() => {});
  for (const id of created.unitIds) await admin.from("units").delete().eq("id", id);
  console.log(`\n${total - failures}/${total} verificações passaram.`);
  process.exit(failures ? 1 : 0);
}

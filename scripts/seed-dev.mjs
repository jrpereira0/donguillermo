// Dados de DESENVOLVIMENTO: administrador da rede + 3 usuários de teste.
//
// - Admin real: e-mail em ADMIN_EMAIL. Se ADMIN_INITIAL_PASSWORD existir no
//   .env.local, a senha é definida; senão a conta nasce sem senha e você usa
//   "Esqueci minha senha" na tela de login (Etapa 3).
// - Usuários de teste: senhas aleatórias gravadas em .dev-credentials.local.md
//   (ignorado pelo Git). Rode de novo para gerar senhas novas.
//
// Uso: npm run db:seed
import { writeFileSync } from "node:fs";
import { adminClient, randomPassword, requireEnv, upsertUser } from "./_lib.mjs";

const admin = adminClient();
const UNIT_SLUG = "sao-bernardo-metropole";

const { data: unit, error: unitErr } = await admin
  .from("units")
  .select("id, name")
  .eq("slug", UNIT_SLUG)
  .maybeSingle();
if (unitErr || !unit) {
  console.error(
    `Unidade '${UNIT_SLUG}' não encontrada. Aplique as migrations antes (npm run db:migrate ou db:bundle).`,
    unitErr?.message ?? "",
  );
  process.exit(1);
}

async function ensureMember(userId, role, unitId) {
  let q = admin.from("unit_members").select("id").eq("user_id", userId).eq("role", role);
  q = unitId ? q.eq("unit_id", unitId) : q.is("unit_id", null);
  const { data: found } = await q.maybeSingle();
  if (found) {
    await admin.from("unit_members").update({ is_active: true }).eq("id", found.id);
    return;
  }
  const { error } = await admin
    .from("unit_members")
    .insert({ user_id: userId, role, unit_id: unitId });
  if (error) throw error;
}

// 1) Administrador real
const adminEmail = requireEnv("ADMIN_EMAIL");
const adminPassword = process.env.ADMIN_INITIAL_PASSWORD || undefined;
const realAdmin = await upsertUser(admin, {
  email: adminEmail,
  password: adminPassword,
  fullName: "Administrador da rede",
});
await ensureMember(realAdmin.id, "admin_rede", null);
console.log(
  `Admin da rede: ${adminEmail.replace(/^(.).*@/, "$1***@")} ` +
    (adminPassword ? "(senha definida pelo .env.local)" : "(sem senha: use 'Esqueci minha senha')"),
);

// 2) Usuários de teste
const testUsers = [
  { email: "admin.teste@donguillermo.dev", role: "admin_rede", unitId: null, name: "Admin Teste" },
  { email: "recepcao.teste@donguillermo.dev", role: "recepcao", unitId: unit.id, name: "Recepção Teste" },
  { email: "barbeiro.teste@donguillermo.dev", role: "barbeiro", unitId: unit.id, name: "Barbeiro Teste" },
];

const lines = [
  "# Credenciais de TESTE (somente desenvolvimento)",
  "",
  "Arquivo local, ignorado pelo Git. Gerado por `npm run db:seed`.",
  "",
  "| Papel | E-mail | Senha |",
  "|---|---|---|",
];
for (const u of testUsers) {
  const password = randomPassword();
  const created = await upsertUser(admin, { email: u.email, password, fullName: u.name });
  await admin.from("profiles").update({ full_name: u.name }).eq("id", created.id);
  await ensureMember(created.id, u.role, u.unitId);
  lines.push(`| ${u.role} | ${u.email} | \`${password}\` |`);
}
writeFileSync(".dev-credentials.local.md", lines.join("\n") + "\n");
console.log("Usuários de teste criados. Credenciais em .dev-credentials.local.md");

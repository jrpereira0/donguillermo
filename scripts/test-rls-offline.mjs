// Teste OFFLINE de RLS: roda as migrations num Postgres embutido (PGlite) com stubs
// do schema auth. Não precisa de rede, senha de banco nem do projeto Supabase.
// Uso: npm run test:rls:offline
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);
const dir = "supabase/migrations";
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(dir, f), "utf8"));
  console.log("migration ok:", f);
}

let total = 0, fail = 0;
const check = (n, c, x = "") => { total++; if (c) console.log("  ok  ", n); else { fail++; console.log("  FALHOU", n, x); } };
const uid = async (email) => (await db.query("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
const as = async (id) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]); await db.exec(`set role ${id ? "authenticated" : "anon"}`); };
const q = async (sql, p) => { try { const r = await db.query(sql, p); return { rows: r.rows, n: r.affectedRows ?? r.rows.length }; } catch (e) { return { err: e.message, rows: [], n: 0 }; } };

const A = (await db.query("select id from units where slug='sao-bernardo-metropole'")).rows[0].id;
const B = (await db.query("insert into units (slug,name) values ('outra-unidade','Outra') returning id")).rows[0].id;
const [recepA, barbA, recepB, adm, nobody] = [await uid("ra@x"), await uid("ba@x"), await uid("rb@x"), await uid("ad@x"), await uid("nb@x")];
const prof = (await db.query("select count(*)::int c from profiles")).rows[0].c;
check("trigger criou 5 profiles", prof === 5, prof);
await db.query("insert into unit_members (user_id, unit_id, role) values ($1,$2,'recepcao'),($3,$2,'barbeiro'),($4,$5,'recepcao')", [recepA, A, barbA, recepB, B]);
await db.query("insert into unit_members (user_id, role) values ($1,'admin_rede')", [adm]);

const bad = await q("insert into unit_members (user_id, role, unit_id) values ($1,'recepcao',null)", [nobody]);
check("constraint: recepcao sem unidade é rejeitada", !!bad.err);
const dup = await q("insert into unit_members (user_id, unit_id, role) values ($1,$2,'recepcao')", [recepA, A]);
check("índice único: papel duplicado é rejeitado", !!dup.err);

console.log("\n[anon]");
await as(null);
check("não lê units", (await q("select * from units")).err !== undefined || (await q("select * from units")).rows.length === 0);

console.log("\n[recepção A]");
await as(recepA);
let r = await q("select id from units"); check("vê só a unidade A", r.rows.length === 1 && r.rows[0].id === A, JSON.stringify(r));
r = await q("select user_id from unit_members"); check("vê vínculos da unidade A (recepção + barbeiro)", r.rows.length === 2, r.rows.length);
r = await q("select id from profiles"); check("vê perfis: ela + barbeiro A (2)", r.rows.length === 2, r.rows.length);
check("não vê perfil da recepção B", !r.rows.some((x) => x.id === recepB));
r = await q("insert into units (slug,name) values ('invasora','Invasora')"); check("NÃO cria unidade", !!r.err);
r = await q("update units set name='x' where id=$1", [B]); check("NÃO altera unidade B", r.n === 0 || !!r.err, JSON.stringify(r));
r = await q("insert into unit_members (user_id, role) values ($1,'admin_rede')", [recepA]); check("NÃO se promove admin", !!r.err);
r = await q("update profiles set is_active = true where id=$1", [recepA]); check("NÃO altera is_active", !!r.err, JSON.stringify(r));
r = await q("update profiles set full_name='Novo' where id=$1", [recepA]); check("altera o próprio nome", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update profiles set full_name='Hack' where id=$1", [barbA]); check("NÃO altera nome de outro", r.n === 0 || !!r.err);
r = await q("select is_network_admin() as a"); check("is_network_admin() = false", r.rows[0]?.a === false);

console.log("\n[recepção B]");
await as(recepB);
r = await q("select id from units"); check("vê só a unidade B", r.rows.length === 1 && r.rows[0].id === B);
r = await q("select id from profiles"); check("NÃO vê o barbeiro A", !r.rows.some((x) => x.id === barbA));

console.log("\n[barbeiro A]");
await as(barbA);
r = await q("select id from units"); check("vê a própria unidade", r.rows.length === 1 && r.rows[0].id === A);
r = await q("select user_id from unit_members"); check("vê só o próprio vínculo", r.rows.length === 1 && r.rows[0].user_id === barbA);
r = await q("select id from profiles"); check("vê só o próprio perfil", r.rows.length === 1);

console.log("\n[sem papel]");
await as(nobody);
r = await q("select id from units"); check("não vê unidades", r.rows.length === 0);

console.log("\n[admin]");
await as(adm);
r = await q("select id from units"); check("vê as 2 unidades", r.rows.length === 2);
r = await q("update units set name='Renomeada' where id=$1", [B]); check("altera unidade", r.n === 1, JSON.stringify(r));
r = await q("select id from profiles"); check("vê todos os perfis", r.rows.length === 5);
r = await q("insert into units (slug,name) values ('nova-unidade','Nova')"); check("cria unidade", !r.err, r.err);

console.log("\n[unidade B desativada]");
await db.exec("reset role");
await db.query("update units set is_active=false where id=$1", [B]);
await as(recepB);
r = await q("select id from units"); check("recepção B perde acesso", r.rows.length === 0);
await as(adm);
r = await q("select id from units where id=$1", [B]); check("admin ainda vê", r.rows.length === 1);

console.log(`\n${total - fail}/${total} ok`);
process.exit(fail ? 1 : 0);

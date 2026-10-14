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
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant all on storage.objects, storage.buckets to service_role;
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

console.log("\n[profissionais (barbers)]");
await db.exec("reset role");
const bA = (await db.query("insert into barbers (unit_id, user_id, full_name, display_name, cnpj) values ($1,$2,'João da Silva','João',$3) returning id", [A, barbA, "11222333000181"])).rows[0].id;
const bB = (await db.query("insert into barbers (unit_id, full_name, display_name) values ($1,'Pedro Souza','Pedro') returning id", [B])).rows[0].id;
// obs.: a unidade B só será desativada mais abaixo

await as(recepA);
r = await q("select id from barbers"); check("recepção A vê só os barbeiros da unidade A", r.rows.length === 1 && r.rows[0].id === bA, JSON.stringify(r.rows));
r = await q("insert into barbers (unit_id, full_name, display_name) values ($1,'Invasor','Inv')", [A]); check("recepção NÃO insere direto (só o servidor)", !!r.err);
r = await q("update barbers set display_name='Joãozinho', commission_services_pct=40 where id=$1", [bA]); check("recepção A edita barbeiro da própria unidade", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update barbers set display_name='Hack' where id=$1", [bB]); check("recepção A NÃO edita barbeiro da unidade B", r.n === 0 || !!r.err);
r = await q("update barbers set unit_id=$1 where id=$2", [B, bA]); check("NÃO muda unit_id (sem privilégio de coluna)", !!r.err);
r = await q("update barbers set user_id=$1 where id=$2", [recepA, bA]); check("NÃO muda user_id (sem privilégio de coluna)", !!r.err);
r = await q("update barbers set commission_services_pct=150 where id=$1", [bA]); check("comissão > 100 é rejeitada", !!r.err);
r = await q("update barbers set cnpj='123' where id=$1", [bA]); check("CNPJ inválido (formato) é rejeitado", !!r.err);
r = await q("update barbers set phone='123' where id=$1", [bA]); check("telefone inválido (formato) é rejeitado", !!r.err);
r = await q("update barbers set phone='11912345678', cnpj='12ABC34501DE35' where id=$1", [bA]); check("telefone e CNPJ alfanumérico válidos são aceitos", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update barbers set photo_path=$1 where id=$2", [`${B}/${bA}.webp`, bA]); check("foto de outra unidade é rejeitada", !!r.err);
r = await q("update barbers set photo_path=$1 where id=$2", [`${A}/${bA}.webp`, bA]); check("foto da própria unidade é aceita", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update barbers set is_active=false where id=$1", [bA]); check("recepção desativa barbeiro", r.n === 1 && !r.err);
r = await q("delete from barbers where id=$1", [bA]); check("NÃO exclui barbeiro (sem DELETE)", !!r.err || r.n === 0);

await as(recepB);
r = await q("select id from barbers"); check("recepção B vê só o barbeiro B", r.rows.length === 1 && r.rows[0].id === bB);

await as(barbA);
r = await q("select id from barbers"); check("barbeiro A vê só a própria linha", r.rows.length === 1 && r.rows[0].id === bA, JSON.stringify(r.rows));
r = await q("update barbers set commission_services_pct=100 where id=$1", [bA]); check("barbeiro NÃO edita nem a própria comissão", r.n === 0 || !!r.err);

await as(nobody);
r = await q("select id from barbers"); check("usuário sem papel não vê barbeiros", r.rows.length === 0);
await as(null);
r = await q("select id from barbers"); check("anônimo não lê barbeiros", !!r.err || r.rows.length === 0);

await as(adm);
r = await q("select id from barbers"); check("admin vê barbeiros das 2 unidades", r.rows.length === 2, r.rows.length);
r = await q("update barbers set display_name='Pedrão' where id=$1", [bB]); check("admin edita qualquer barbeiro", r.n === 1 && !r.err);

console.log("\n[fotos (storage)]");
await db.exec("reset role");
await db.query("select 1"); // o bucket já foi criado pela migration
r = await q("select id, public, file_size_limit from storage.buckets where id='barber-photos'"); check("bucket barber-photos existe, público e com limite de 1 MB", r.rows.length === 1 && r.rows[0].public === true && Number(r.rows[0].file_size_limit) === 1048576, JSON.stringify(r.rows));
const photoA = `${A}/${bA}.webp`;
await as(recepA);
r = await q("insert into storage.objects (bucket_id, name) values ('barber-photos', $1)", [photoA]); check("recepção A envia foto na pasta da unidade A", !r.err, r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('barber-photos', $1)", [`${B}/${bB}.webp`]); check("recepção A NÃO envia foto na pasta da unidade B", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('barber-photos', $1)", [`${A}/${bA}.exe`]); check("extensão fora de webp/jpg/png é rejeitada", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('barber-photos', $1)", [`${A}/../${B}/${bB}.webp`]); check("caminho com ../ é rejeitado", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('barber-photos', 'solta.webp')"); check("arquivo fora de pasta de unidade é rejeitado", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('outro-bucket', $1)", [photoA]); check("RLS só autoriza o bucket barber-photos", !!r.err);
r = await q("select name from storage.objects"); check("recepção A lista a própria foto", r.rows.length === 1);
await as(recepB);
r = await q("select name from storage.objects"); check("recepção B NÃO vê foto da unidade A", r.rows.length === 0);
r = await q("update storage.objects set name=$1 where name=$2", [`${B}/${bA}.webp`, photoA]); check("recepção B NÃO move/edita foto da A", r.n === 0 || !!r.err);
r = await q("delete from storage.objects where name=$1", [photoA]); check("recepção B NÃO apaga foto da A", r.n === 0 || !!r.err);
await as(barbA);
r = await q("insert into storage.objects (bucket_id, name) values ('barber-photos', $1)", [`${A}/${bA}.png`]); check("barbeiro NÃO envia foto", !!r.err);
await as(adm);
r = await q("insert into storage.objects (bucket_id, name) values ('barber-photos', $1)", [`${B}/${bB}.jpg`]); check("admin envia foto em qualquer unidade", !r.err, r.err);
await as(recepA);
r = await q("delete from storage.objects where name=$1", [photoA]); check("recepção A apaga a própria foto", r.n === 1 && !r.err, JSON.stringify(r));

console.log("\n[unidade B desativada]");
await db.exec("reset role");
await db.query("update units set is_active=false where id=$1", [B]);
await as(recepB);
r = await q("select id from units"); check("recepção B perde acesso", r.rows.length === 0);
await as(adm);
r = await q("select id from units where id=$1", [B]); check("admin ainda vê", r.rows.length === 1);

console.log(`\n${total - fail}/${total} ok`);
process.exit(fail ? 1 : 0);

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

console.log("\n[serviços]");
await db.exec("reset role");
const sB = (await db.query("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'Barba B','barba',20,3000) returning id", [B])).rows[0].id;

await as(recepA);
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'Corte','cabelo',30,4500) returning id", [A]);
check("recepção A cria serviço na própria unidade", !r.err && r.rows.length === 1, r.err);
const sA = r.rows[0]?.id;
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'Invasor','cabelo',30,100)", [B]); check("recepção A NÃO cria serviço na unidade B", !!r.err);
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'  CORTE ','cabelo',30,100)", [A]); check("nome repetido (sem diferenciar caixa/espaços) é rejeitado", !!r.err);
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'Corte','cabelo',30,100)", [B]); check("o mesmo nome pode existir em outra unidade (recepção A não escreve lá)", !!r.err);
for (const [cat, ok] of [["quimica", true], ["tratamento", true], ["outros", true], ["massagem", true], ["hack", false]]) {
  r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,$2,$3,30,100)", [A, "cat-" + cat, cat]);
  check("categoria '" + cat + "' " + (ok ? "é aceita" : "é rejeitada"), ok ? !r.err : !!r.err, r.err);
}
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'dur-4','cabelo',4,100)", [A]); check("duração abaixo de 5 min é rejeitada", !!r.err);
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'dur-481','cabelo',481,100)", [A]); check("duração acima de 480 min é rejeitada", !!r.err);
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'preco-neg','cabelo',30,-1)", [A]); check("preço negativo é rejeitado", !!r.err);
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'x','cabelo',30,100)", [A]); check("nome com 1 letra é rejeitado", !!r.err);
r = await q("update services set price_cents=5000, duration_minutes=40 where id=$1", [sA]); check("recepção A edita serviço da própria unidade", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update services set price_cents=1 where id=$1", [sB]); check("recepção A NÃO edita serviço da unidade B", r.n === 0 || !!r.err);
r = await q("update services set unit_id=$1 where id=$2", [B, sA]); check("NÃO muda unit_id do serviço (sem privilégio de coluna)", !!r.err);
r = await q("delete from services where id=$1", [sA]); check("NÃO exclui serviço (sem DELETE)", !!r.err || r.n === 0);
r = await q("update services set image_path=$1 where id=$2", [`${B}/${sA}.webp`, sA]); check("imagem na pasta de outra unidade é rejeitada", !!r.err);
r = await q("update services set image_path=$1 where id=$2", [`${A}/${sA}.webp`, sA]); check("imagem na pasta da própria unidade é aceita", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("select id from services where unit_id=$1", [A]); check("recepção A vê os serviços da unidade A", r.rows.some((x) => x.id === sA));
r = await q("select id from services"); check("recepção A NÃO vê serviços da unidade B", !r.rows.some((x) => x.id === sB));
r = await q("update services set is_active=false where id=$1", [sA]); check("recepção A desativa serviço", r.n === 1 && !r.err);
await q("update services set is_active=true where id=$1", [sA]);

console.log("\n[serviços: quem faz cada serviço (barber_services)]");
await as(recepA);
r = await q("insert into barber_services (barber_id, service_id, unit_id) values ($1,$2,$3)", [bA, sA, A]); check("recepção A liga barbeiro A ao serviço A", !r.err, r.err);
r = await q("insert into barber_services (barber_id, service_id, unit_id) values ($1,$2,$3)", [bA, sA, A]); check("ligação repetida é rejeitada", !!r.err);
r = await q("insert into barber_services (barber_id, service_id, unit_id) values ($1,$2,$3)", [bB, sA, A]); check("NÃO liga barbeiro de outra unidade (chave composta)", !!r.err);
r = await q("insert into barber_services (barber_id, service_id, unit_id) values ($1,$2,$3)", [bA, sB, A]); check("NÃO liga serviço de outra unidade (chave composta)", !!r.err);
r = await q("insert into barber_services (barber_id, service_id, unit_id) values ($1,$2,$3)", [bB, sB, B]); check("recepção A NÃO cria ligação na unidade B", !!r.err);
r = await q("update barber_services set duration_minutes=45 where barber_id=$1 and service_id=$2", [bA, sA]); check("recepção A define duração própria do barbeiro", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update barber_services set duration_minutes=4 where barber_id=$1 and service_id=$2", [bA, sA]); check("duração própria abaixo de 5 min é rejeitada", !!r.err);
r = await q("update barber_services set duration_minutes=null where barber_id=$1 and service_id=$2", [bA, sA]); check("duração própria pode voltar ao padrão (null)", r.n === 1 && !r.err);
r = await q("update barber_services set unit_id=$1 where barber_id=$2", [B, bA]); check("NÃO muda a unidade da ligação (sem privilégio de coluna)", !!r.err);
r = await q("update barber_services set barber_id=$1 where barber_id=$2", [bB, bA]); check("NÃO troca o barbeiro da ligação (sem privilégio de coluna)", !!r.err);
r = await q("select barber_id from barber_services"); check("recepção A vê a ligação da própria unidade", r.rows.length === 1);

await as(barbA);
r = await q("select barber_id from barber_services"); check("barbeiro A lê as ligações da própria unidade", r.rows.length === 1);
r = await q("select id from services"); check("barbeiro A lê o catálogo da própria unidade", r.rows.some((x) => x.id === sA) && !r.rows.some((x) => x.id === sB));
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'Do barbeiro','cabelo',30,100)", [A]); check("barbeiro NÃO cria serviço", !!r.err);
r = await q("update services set price_cents=1 where id=$1", [sA]); check("barbeiro NÃO edita serviço", r.n === 0 || !!r.err);
r = await q("insert into barber_services (barber_id, service_id, unit_id) values ($1,$2,$3)", [bA, sA, A]); check("barbeiro NÃO cria ligação", !!r.err);
r = await q("delete from barber_services where barber_id=$1", [bA]); check("barbeiro NÃO remove ligação", r.n === 0 || !!r.err);
r = await q("update barber_services set duration_minutes=10 where barber_id=$1", [bA]); check("barbeiro NÃO altera duração da ligação", r.n === 0 || !!r.err);

await as(recepB);
r = await q("select id from services"); check("recepção B vê só os serviços da unidade B", r.rows.length === 1 && r.rows[0].id === sB, JSON.stringify(r.rows));
r = await q("select barber_id from barber_services"); check("recepção B NÃO vê ligações da unidade A", r.rows.length === 0);
r = await q("delete from barber_services where barber_id=$1", [bA]); check("recepção B NÃO remove ligação da unidade A", r.n === 0 || !!r.err);
r = await q("update services set price_cents=1 where id=$1", [sA]); check("recepção B NÃO edita serviço da unidade A", r.n === 0 || !!r.err);

await as(nobody);
r = await q("select id from services"); check("usuário sem papel não vê serviços", r.rows.length === 0);
r = await q("select barber_id from barber_services"); check("usuário sem papel não vê ligações", r.rows.length === 0);
await as(null);
r = await q("select id from services"); check("anônimo não lê serviços", !!r.err || r.rows.length === 0);
r = await q("select barber_id from barber_services"); check("anônimo não lê ligações", !!r.err || r.rows.length === 0);

await as(adm);
r = await q("select id from services"); check("admin vê serviços das 2 unidades", r.rows.some((x) => x.id === sA) && r.rows.some((x) => x.id === sB));
r = await q("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'Do admin','combo',60,9000)", [B]); check("admin cria serviço em qualquer unidade", !r.err, r.err);
r = await q("insert into barber_services (barber_id, service_id, unit_id) values ($1,$2,$3)", [bB, sB, B]); check("admin liga barbeiro e serviço em qualquer unidade", !r.err, r.err);
r = await q("delete from barber_services where barber_id=$1 and service_id=$2", [bB, sB]); check("admin remove ligação", r.n === 1 && !r.err);

await as(recepA);
r = await q("delete from barber_services where barber_id=$1 and service_id=$2", [bA, sA]); check("recepção A remove ligação da própria unidade", r.n === 1 && !r.err, JSON.stringify(r));

await db.exec("reset role");
await db.query("insert into barber_services (barber_id, service_id, unit_id) values ($1,$2,$3)", [bA, sA, A]);
await db.query("delete from services where id=$1", [sA]);
r = await q("select count(*)::int c from barber_services where service_id=$1", [sA]); check("apagar o serviço remove as ligações (cascade)", r.rows[0].c === 0);

console.log("\n[imagens dos serviços (storage)]");
await db.exec("reset role");
r = await q("select public, file_size_limit, allowed_mime_types from storage.buckets where id='service-images'"); check("bucket service-images existe, público, 1 MB, só imagens", r.rows.length === 1 && r.rows[0].public === true && Number(r.rows[0].file_size_limit) === 1048576 && r.rows[0].allowed_mime_types.length === 3, JSON.stringify(r.rows));
const sImg = (await db.query("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'Com imagem','cabelo',30,100) returning id", [A])).rows[0].id;
const imgA = `${A}/${sImg}.webp`;
await as(recepA);
r = await q("insert into storage.objects (bucket_id, name) values ('service-images', $1)", [imgA]); check("recepção A envia imagem na pasta da unidade A", !r.err, r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('service-images', $1)", [`${B}/${sB}.webp`]); check("recepção A NÃO envia imagem na pasta da unidade B", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('service-images', $1)", [`${A}/${sImg}.gif`]); check("extensão fora de webp/jpg/png é rejeitada", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('service-images', $1)", [`${A}/../${B}/${sB}.webp`]); check("caminho com ../ é rejeitado", !!r.err);
r = await q("select name from storage.objects where bucket_id='service-images'"); check("recepção A vê a própria imagem", r.rows.length === 1);
await as(recepB);
r = await q("select name from storage.objects where bucket_id='service-images'"); check("recepção B NÃO vê imagem da unidade A", r.rows.length === 0);
r = await q("delete from storage.objects where name=$1", [imgA]); check("recepção B NÃO apaga imagem da unidade A", r.n === 0 || !!r.err);
await as(barbA);
r = await q("insert into storage.objects (bucket_id, name) values ('service-images', $1)", [`${A}/${sImg}.png`]); check("barbeiro NÃO envia imagem de serviço", !!r.err);
await as(adm);
r = await q("insert into storage.objects (bucket_id, name) values ('service-images', $1)", [`${B}/${sB}.jpg`]); check("admin envia imagem em qualquer unidade", !r.err, r.err);
await as(recepA);
r = await q("delete from storage.objects where name=$1", [imgA]); check("recepção A apaga a própria imagem", r.n === 1 && !r.err, JSON.stringify(r));

console.log("\n[clientes (cadastro único da rede)]");
await db.exec("reset role");
const NEW = () => crypto.randomUUID();
const INS = "insert into customers (id, created_unit_id, full_name, phone, cpf) values ($1,$2,$3,$4,$5) returning id";

r = await q("select 1 from information_schema.columns where table_name='customers' and column_name='notes'");
check("coluna antiga customers.notes foi removida (agora é lista)", r.rows.length === 0);
r = await q("select public, file_size_limit, allowed_mime_types from storage.buckets where id='customer-photos'");
check("bucket customer-photos existe, público, 1 MB, só imagens", r.rows.length === 1 && r.rows[0].public === true && Number(r.rows[0].file_size_limit) === 1048576 && r.rows[0].allowed_mime_types.length === 3, JSON.stringify(r.rows));

await as(recepA);
r = await q("select is_any_reception() as v"); check("is_any_reception() = true para recepção", r.rows[0]?.v === true);
const cA = NEW();
r = await q(INS, [cA, A, "José Ânimo da Silva", "11912345678", "52998224725"]); check("recepção A cadastra cliente com origem na unidade A", !r.err && r.rows.length === 1, r.err);
r = await q("select search_name, registered_via, marketing_consent, is_active from customers where id=$1", [cA]);
check("search_name vem sem acento e em minúsculas", r.rows[0]?.search_name === "jose animo da silva", JSON.stringify(r.rows));
check("padrões: via 'recepcao', sem consentimento, ativo", r.rows[0]?.registered_via === "recepcao" && r.rows[0]?.marketing_consent === false && r.rows[0]?.is_active === true);
r = await q(INS, [NEW(), B, "Origem Em B", "11911112222", null]); check("recepção A NÃO cadastra com origem na unidade B", !!r.err);
r = await q("insert into customers (id, full_name, phone) values ($1,'Sem Origem','11911112222')", [NEW()]); check("recepção NÃO cadastra sem unidade de origem", !!r.err);
r = await q("insert into customers (id, created_unit_id, registered_via, full_name) values ($1,$2,'autocadastro','Auto Cadastro')", [NEW(), A]); check("recepção NÃO grava como 'autocadastro' (só o servidor)", !!r.err);
r = await q(INS, [NEW(), A, "Outro Mesmo Cpf", "11911112222", "52998224725"]); check("CPF repetido na rede é rejeitado", !!r.err);
r = await q(INS, [NEW(), A, "Telefone Repetido", "11912345678", null]); check("telefone repetido é permitido (famílias dividem número)", !r.err, r.err);
r = await q(INS, [NEW(), A, "Sem Cpf Um", "11911110000", null]);
r = await q(INS, [NEW(), A, "Sem Cpf Dois", "11911110001", null]); check("vários clientes sem CPF são permitidos", !r.err, r.err);

for (const [nome, col, val] of [
  ["telefone inválido", "phone", "123"],
  ["CPF com formato inválido", "cpf", "123.456"],
  ["e-mail inválido", "email", "sem-arroba"],
  ["UF em minúsculas", "state", "sp"],
  ["CEP inválido", "cep", "123"],
  ["nascimento no futuro", "birth_date", "2999-01-01"],
  ["nascimento antes de 1900", "birth_date", "1800-01-01"],
  ["nome com 1 letra", "full_name", "A"],
  ["foto com nome fora do padrão", "photo_path", "foto.webp"],
  ["origem 'como conheceu' inválida", "referral_source", "tv"],
]) {
  r = await q(`update customers set ${col}=$1 where id=$2`, [val, cA]);
  check(`${nome} é rejeitado`, !!r.err, JSON.stringify(r));
}
r = await q("update customers set referral_source='instagram', marketing_consent=true, consent_at=now(), email='jose@x.com', state='SP', cep='01310100', birth_date='1990-05-20' where id=$1", [cA]);
check("recepção A edita dados completos do cliente", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update customers set photo_path=$1 where id=$2", [`${cA}.webp`, cA]); check("foto <id>.webp é aceita", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update customers set created_unit_id=$1 where id=$2", [B, cA]); check("unidade de origem NÃO muda (sem privilégio de coluna)", !!r.err);
r = await q("update customers set registered_via='autocadastro' where id=$1", [cA]); check("forma de cadastro NÃO muda (sem privilégio de coluna)", !!r.err);
r = await q("update customers set created_at=now() where id=$1", [cA]); check("data de cadastro NÃO muda (sem privilégio de coluna)", !!r.err);
r = await q("update customers set is_active=false where id=$1", [cA]); check("recepção desativa cliente", r.n === 1 && !r.err);
await q("update customers set is_active=true where id=$1", [cA]);
r = await q("delete from customers where id=$1", [cA]); check("NÃO exclui cliente (sem DELETE)", !!r.err || r.n === 0);
r = await q("select id, name from network_units()"); check("network_units() devolve as unidades da rede (A e B)", r.rows.some((x) => x.id === A) && r.rows.some((x) => x.id === B), JSON.stringify(r.rows));

await as(recepB);
r = await q("select id, created_unit_id from customers where id=$1", [cA]); check("recepção B (outra unidade) VÊ o cliente da A: cadastro é da rede", r.rows.length === 1 && r.rows[0].created_unit_id === A, JSON.stringify(r.rows));
r = await q("update customers set city='Santo André' where id=$1", [cA]); check("recepção B edita cliente cadastrado na unidade A", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("select created_unit_id from customers where id=$1", [cA]); check("origem continua a unidade A depois da edição pela B", r.rows[0]?.created_unit_id === A);
const cB = NEW();
r = await q(INS, [cB, B, "Cliente Da B", "11922223333", null]); check("recepção B cadastra cliente com origem na unidade B", !r.err, r.err);
r = await q(INS, [NEW(), A, "Origem Em A Pela B", "11922224444", null]); check("recepção B NÃO cadastra com origem na unidade A", !!r.err);

await as(barbA);
r = await q("select id from customers"); check("barbeiro NÃO lê clientes", r.rows.length === 0, r.rows.length);
r = await q(INS, [NEW(), A, "Do Barbeiro", "11933334444", null]); check("barbeiro NÃO cadastra cliente", !!r.err);
r = await q("update customers set city='Hack' where id=$1", [cA]); check("barbeiro NÃO edita cliente", r.n === 0 || !!r.err);
r = await q("select is_any_reception() as v"); check("is_any_reception() = false para barbeiro", r.rows[0]?.v === false);
r = await q("select id from network_units()"); check("barbeiro NÃO lista unidades da rede", r.rows.length === 0, r.rows.length);

await as(nobody);
r = await q("select id from customers"); check("usuário sem papel não lê clientes", r.rows.length === 0);
r = await q(INS, [NEW(), A, "Sem Papel", "11944445555", null]); check("usuário sem papel não cadastra cliente", !!r.err);
await as(null);
r = await q("select id from customers"); check("anônimo não lê clientes", !!r.err || r.rows.length === 0);
r = await q(INS, [NEW(), A, "Anonimo", "11955556666", null]); check("anônimo não cadastra cliente", !!r.err);
r = await q("select id from network_units()"); check("anônimo não lista unidades pela função", !!r.err || r.rows.length === 0);

await as(adm);
r = await q("select id from customers"); check("admin vê clientes de todas as origens", r.rows.some((x) => x.id === cA) && r.rows.some((x) => x.id === cB));
r = await q(INS, [NEW(), B, "Do Admin", "11966667777", null]); check("admin cadastra cliente em qualquer unidade", !r.err, r.err);
r = await q("update customers set city='Admin' where id=$1", [cB]); check("admin edita qualquer cliente", r.n === 1 && !r.err);

console.log("\n[clientes: observações (customer_notes)]");
await as(recepA);
const NOTE = "insert into customer_notes (customer_id, unit_id, body) values ($1,$2,$3) returning id, created_by, author_name, unit_id";
r = await q(NOTE, [cA, A, "Gosta de máquina 2."]); check("recepção A adiciona observação ao cliente", !r.err && r.rows.length === 1, r.err);
const nA = r.rows[0]?.id;
check("autor vem da sessão (created_by = recepção A) e o nome é gravado", r.rows[0]?.created_by === recepA && !!r.rows[0]?.author_name, JSON.stringify(r.rows));
check("unidade da observação gravada (A)", r.rows[0]?.unit_id === A);
r = await q("insert into customer_notes (customer_id, unit_id, body, created_by) values ($1,$2,'Forjada',$3)", [cA, A, recepB]); check("NÃO dá para assinar como outra pessoa (created_by sem privilégio)", !!r.err);
r = await q("insert into customer_notes (customer_id, unit_id, body, author_name) values ($1,$2,'Forjada','Fulano')", [cA, A]); check("NÃO dá para escolher o nome do autor (sem privilégio)", !!r.err);
r = await q(NOTE, [cA, B, "Em nome da unidade B"]); check("recepção A NÃO grava observação com unidade B", !!r.err);
r = await q("insert into customer_notes (customer_id, body) values ($1,'Sem unidade')", [cA]); check("observação sem unidade é rejeitada", !!r.err);
r = await q(NOTE, [cA, A, ""]); check("observação vazia é rejeitada", !!r.err);
r = await q(NOTE, [cA, A, "   "]); check("observação só com espaços é rejeitada", !!r.err);
r = await q(NOTE, [cA, A, "a".repeat(1001)]); check("observação com mais de 1000 caracteres é rejeitada", !!r.err);
r = await q(NOTE, [cA, A, "a".repeat(1000)]); check("observação com exatamente 1000 caracteres é aceita", !r.err, r.err);
r = await q(NOTE, [cA, A, "Alergia a pomada X."]); check("o cliente pode ter VÁRIAS observações", !r.err, r.err);
r = await q("select id from customer_notes where customer_id=$1", [cA]); check("recepção A lê as observações do cliente", r.rows.length === 3, r.rows.length);
r = await q("update customer_notes set body='Gosta da máquina 3.' where id=$1", [nA]); check("recepção A edita a própria observação", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("select author_name, created_by, updated_at > created_at as editada from customer_notes where id=$1", [nA]);
check("editar preserva o autor e atualiza updated_at", r.rows[0]?.created_by === recepA && r.rows[0]?.editada === true, JSON.stringify(r.rows));
r = await q("update customer_notes set body='' where id=$1", [nA]); check("editar para vazio é rejeitado", !!r.err);
for (const col of ["created_by", "author_name", "unit_id", "customer_id", "created_at"]) {
  const val = col === "created_by" ? recepB : col === "unit_id" ? B : col === "customer_id" ? cB : col === "created_at" ? new Date().toISOString() : "Outro";
  r = await q(`update customer_notes set ${col}=$1 where id=$2`, [val, nA]);
  check(`coluna ${col} NÃO muda (sem privilégio)`, !!r.err, JSON.stringify(r));
}

await as(recepB);
r = await q("select id from customer_notes where customer_id=$1", [cA]); check("recepção B (outra unidade) lê as observações do cliente da A", r.rows.length === 3, r.rows.length);
r = await q("update customer_notes set body='Editada pela B.' where id=$1", [nA]); check("recepção B edita observação escrita pela A", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("select created_by, author_name from customer_notes where id=$1", [nA]); check("a observação continua assinada pela recepção A", r.rows[0]?.created_by === recepA);
r = await q(NOTE, [cA, A, "Da B na unidade A"]); check("recepção B NÃO grava observação com unidade A", !!r.err);
r = await q(NOTE, [cA, B, "Escrita na unidade B"]); check("recepção B grava observação do cliente da A (com a própria unidade)", !r.err, r.err);
const nB = r.rows[0]?.id;
r = await q("select unit_id from customer_notes where id=$1", [nB]); check("a unidade da observação (B) fica registrada", r.rows[0]?.unit_id === B);
r = await q("delete from customer_notes where id=$1", [nB]); check("recepção B exclui observação", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("delete from customer_notes where id=$1", [nA]); check("recepção B exclui observação escrita pela A", r.n === 1 && !r.err, JSON.stringify(r));

await as(barbA);
r = await q("select id from customer_notes"); check("barbeiro NÃO lê observações", r.rows.length === 0);
r = await q(NOTE, [cA, A, "Do barbeiro"]); check("barbeiro NÃO escreve observação", !!r.err);
r = await q("update customer_notes set body='Hack' where customer_id=$1", [cA]); check("barbeiro NÃO edita observação", r.n === 0 || !!r.err);
r = await q("delete from customer_notes where customer_id=$1", [cA]); check("barbeiro NÃO exclui observação", r.n === 0 || !!r.err);

await as(nobody);
r = await q("select id from customer_notes"); check("usuário sem papel não lê observações", r.rows.length === 0);
r = await q(NOTE, [cA, A, "Sem papel"]); check("usuário sem papel não escreve observação", !!r.err);
await as(null);
r = await q("select id from customer_notes"); check("anônimo não lê observações", !!r.err || r.rows.length === 0);
r = await q(NOTE, [cA, A, "Anônimo"]); check("anônimo não escreve observação", !!r.err);

await as(adm);
r = await q(NOTE, [cB, B, "Do admin"]); check("admin escreve observação em qualquer unidade", !r.err, r.err);
r = await q("select id from customer_notes"); check("admin lê observações de todos os clientes", r.rows.length >= 3, r.rows.length);

await db.exec("reset role");
const nCas = (await db.query("select count(*)::int c from customer_notes where customer_id=$1", [cB])).rows[0].c;
await db.query("delete from customers where id=$1", [cB]);
r = await q("select count(*)::int c from customer_notes where customer_id=$1", [cB]);
check("apagar o cliente apaga as observações (cascade)", nCas >= 1 && r.rows[0].c === 0, `${nCas} -> ${r.rows[0]?.c}`);

console.log("\n[fotos dos clientes (storage)]");
const PH = NEW();
await as(recepA);
r = await q("insert into storage.objects (bucket_id, name) values ('customer-photos', $1)", [`${PH}.webp`]); check("recepção A envia foto <id>.webp", !r.err, r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('customer-photos', $1)", [`${A}/${PH}.webp`]); check("foto dentro de pasta é rejeitada", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('customer-photos', $1)", [`${PH}.gif`]); check("extensão fora de webp/jpg/png é rejeitada", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('customer-photos', 'foto.webp')"); check("nome que não é UUID é rejeitado", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('customer-photos', $1)", [`../${PH}.webp`]); check("caminho com ../ é rejeitado", !!r.err);
await as(recepB);
r = await q("select name from storage.objects where bucket_id='customer-photos'"); check("recepção de OUTRA unidade vê a foto (cliente é da rede)", r.rows.length === 1, r.rows.length);
r = await q("update storage.objects set name=$1 where name=$2", [`${NEW()}.webp`, `${PH}.webp`]); check("recepção B pode substituir/mover a foto (qualquer recepção edita o cliente)", r.n === 1 && !r.err, JSON.stringify(r));
await as(barbA);
r = await q("select name from storage.objects where bucket_id='customer-photos'"); check("barbeiro NÃO vê fotos de clientes", r.rows.length === 0);
r = await q("insert into storage.objects (bucket_id, name) values ('customer-photos', $1)", [`${NEW()}.png`]); check("barbeiro NÃO envia foto de cliente", !!r.err);
await as(nobody);
r = await q("insert into storage.objects (bucket_id, name) values ('customer-photos', $1)", [`${NEW()}.png`]); check("usuário sem papel NÃO envia foto de cliente", !!r.err);
await as(adm);
r = await q("insert into storage.objects (bucket_id, name) values ('customer-photos', $1)", [`${NEW()}.jpg`]); check("admin envia foto de cliente", !r.err, r.err);
await as(recepA);
r = await q("delete from storage.objects where bucket_id='customer-photos'"); check("recepção apaga fotos de clientes", r.n >= 1 && !r.err, JSON.stringify(r));

console.log("\n[unidade B desativada]");
await db.exec("reset role");
await db.query("update units set is_active=false where id=$1", [B]);
await as(recepB);
r = await q("select id from units"); check("recepção B perde acesso", r.rows.length === 0);
r = await q("select id from customers"); check("recepção B perde acesso aos clientes (unidade inativa)", r.rows.length === 0, r.rows.length);
r = await q("select id from customer_notes"); check("recepção B perde acesso às observações (unidade inativa)", r.rows.length === 0, r.rows.length);
await as(adm);
r = await q("select id from units where id=$1", [B]); check("admin ainda vê", r.rows.length === 1);

console.log(`\n${total - fail}/${total} ok`);
process.exit(fail ? 1 : 0);

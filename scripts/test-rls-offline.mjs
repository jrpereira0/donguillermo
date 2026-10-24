// Teste OFFLINE de RLS: roda as migrations num Postgres embutido (PGlite) com stubs
// do schema auth. Não precisa de rede, senha de banco nem do projeto Supabase.
// Uso: npm run test:rls:offline
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const db = new PGlite({ extensions: { btree_gist } });
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
// Servidor/migrations: sem papel de usuário e SEM sessão (auth.uid() nulo), como a service_role.
const asServer = async () => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub', '', false)"); };
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

console.log("\n[configurações da unidade]");
await db.exec("reset role");
r = await q("select cnpj, cep, phones, slot_minutes, logo_path, cover_path from units where id=$1", [A]);
check("unidade nasce com agenda de 30 min e lista de telefones vazia", r.rows[0]?.slot_minutes === 30 && JSON.stringify(r.rows[0]?.phones) === "[]" && r.rows[0]?.logo_path === null, JSON.stringify(r.rows));
const SETTINGS = "update units set name=$2, cnpj='11222333000181', cep='09750000', street='Av. Kennedy', street_number='700', city='São Bernardo', state='SP', phones=$3::jsonb, slot_minutes=$4, address='Av. Kennedy, 700', phone='(11) 4002-8922' where id=$1";
const PHONES = JSON.stringify([{ label: "Recepção", number: "1140028922", whatsapp: false }]);
await as(recepA);
r = await q(SETTINGS, [A, "Don Guillermo Metrópole", PHONES, 15]); check("recepção A altera as configurações da própria unidade", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("select name, cnpj, slot_minutes, phones from units where id=$1", [A]); check("alterações gravadas", r.rows[0]?.name === "Don Guillermo Metrópole" && r.rows[0]?.slot_minutes === 15 && r.rows[0]?.phones?.[0]?.label === "Recepção", JSON.stringify(r.rows));
r = await q(SETTINGS, [B, "Invadida", PHONES, 10]); check("recepção A NÃO altera configurações da unidade B", r.n === 0 || !!r.err, JSON.stringify(r));
r = await q("update units set slug='novo-slug' where id=$1", [A]); check("recepção A NÃO muda o slug (gatilho)", !!r.err, JSON.stringify(r));
r = await q("update units set is_active=false where id=$1", [A]); check("recepção A NÃO desativa a própria unidade (gatilho)", !!r.err, JSON.stringify(r));
r = await q("update units set deleted_at=now() where id=$1", [A]); check("recepção A NÃO exclui a própria unidade (gatilho)", !!r.err, JSON.stringify(r));
r = await q("update units set name='Outro nome', slug=slug where id=$1", [A]); check("atualizar com o slug igual é permitido", r.n === 1 && !r.err, JSON.stringify(r));
for (const [titulo, sql] of [
  ["tempo da agenda fora da lista (7 min)", "update units set slot_minutes=7 where id=$1"],
  ["tempo da agenda zero", "update units set slot_minutes=0 where id=$1"],
  ["tempo da agenda de 45 min", "update units set slot_minutes=45 where id=$1"],
  ["CNPJ com formato inválido", "update units set cnpj='123' where id=$1"],
  ["CNPJ com máscara", "update units set cnpj='11.222.333/0001-81' where id=$1"],
  ["CEP com 7 dígitos", "update units set cep='1234567' where id=$1"],
  ["UF com 3 letras", "update units set state='SPX' where id=$1"],
  ["UF em minúsculas", "update units set state='sp' where id=$1"],
  ["telefones que não é lista", `update units set phones='{"a":1}'::jsonb where id=$1`],
  ["mais de 5 telefones", `update units set phones='[1,2,3,4,5,6]'::jsonb where id=$1`],
  ["logo fora da pasta da unidade", `update units set logo_path='${B}/${NEW()}.webp' where id=$1`],
  ["capa fora da pasta da unidade", `update units set cover_path='${B}/${NEW()}.webp' where id=$1`],
]) {
  r = await q(sql, [A]); check(`rejeita ${titulo}`, !!r.err, JSON.stringify(r));
}
const LOGO = `${A}/${NEW()}.webp`;
r = await q("update units set logo_path=$2, cover_path=$3 where id=$1", [A, LOGO, `${A}/${NEW()}.jpg`]); check("aceita logo e capa dentro da pasta da unidade", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update units set cnpj='1A222333000181' where id=$1", [A]); check("aceita CNPJ alfanumérico (12 primeiras posições)", r.n === 1 && !r.err, JSON.stringify(r));

await as(barbA);
r = await q("update units set name='Hack', slot_minutes=5 where id=$1", [A]); check("barbeiro NÃO altera configurações", r.n === 0 || !!r.err, JSON.stringify(r));
r = await q("select slot_minutes, phones from units where id=$1", [A]); check("barbeiro lê o tempo da agenda e os telefones da unidade", r.rows.length === 1 && r.rows[0].slot_minutes === 15, JSON.stringify(r.rows));
await as(nobody);
r = await q("update units set name='Hack' where id=$1", [A]); check("usuário sem papel NÃO altera configurações", r.n === 0 || !!r.err);
await as(null);
r = await q("update units set name='Hack' where id=$1", [A]); check("anônimo NÃO altera configurações", r.n === 0 || !!r.err);

await as(adm);
r = await q("update units set slot_minutes=20, slug='sao-bernardo-metropole' where id=$1", [A]); check("admin altera configurações da unidade", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update units set is_active=true where id=$1", [B]); check("admin ainda altera a situação (is_active) das unidades", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("update units set slug='slug-do-admin-1' where id=$1", [B]); check("admin pode alterar o slug (a tela não oferece)", r.n === 1 && !r.err, JSON.stringify(r));
await asServer();
await db.query("update units set slug='outra-unidade' where id=$1", [B]);
r = await q("update units set is_active=true where id=$1", [B]); check("sem sessão de usuário (servidor/service_role) o gatilho não bloqueia", !r.err, JSON.stringify(r));

console.log("\n[logo e capa das unidades (storage)]");
const UA = (n = NEW()) => `${A}/${n}.webp`;
await as(recepA);
r = await q("insert into storage.objects (bucket_id, name) values ('unit-assets', $1)", [UA()]); check("recepção A envia logo/capa na pasta da unidade A", !r.err, r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('unit-assets', $1)", [`${B}/${NEW()}.webp`]); check("recepção A NÃO envia na pasta da unidade B", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('unit-assets', $1)", [`${NEW()}.webp`]); check("arquivo sem pasta de unidade é rejeitado", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('unit-assets', $1)", [`${A}/${NEW()}.gif`]); check("extensão fora de webp/jpg/png é rejeitada", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('unit-assets', $1)", [`${A}/logo.webp`]); check("nome que não é UUID é rejeitado", !!r.err);
r = await q("insert into storage.objects (bucket_id, name) values ('unit-assets', $1)", [`${A}/../${B}/${NEW()}.webp`]); check("caminho com ../ é rejeitado", !!r.err);
r = await q("select name from storage.objects where bucket_id='unit-assets'"); check("recepção A lista o que enviou", r.rows.length === 1, r.rows.length);
await as(recepB);
r = await q("select name from storage.objects where bucket_id='unit-assets'"); check("recepção B NÃO lista arquivos da unidade A", r.rows.length === 0, r.rows.length);
r = await q("delete from storage.objects where bucket_id='unit-assets'"); check("recepção B NÃO apaga arquivos da unidade A", r.n === 0 || !!r.err, JSON.stringify(r));
await as(barbA);
r = await q("insert into storage.objects (bucket_id, name) values ('unit-assets', $1)", [UA()]); check("barbeiro NÃO envia logo/capa", !!r.err);
await as(nobody);
r = await q("insert into storage.objects (bucket_id, name) values ('unit-assets', $1)", [UA()]); check("usuário sem papel NÃO envia logo/capa", !!r.err);
await as(adm);
r = await q("insert into storage.objects (bucket_id, name) values ('unit-assets', $1)", [`${B}/${NEW()}.png`]); check("admin envia logo/capa em qualquer unidade", !r.err, r.err);
await as(recepA);
r = await q("delete from storage.objects where bucket_id='unit-assets'"); check("recepção A apaga os arquivos da própria unidade", r.n === 1 && !r.err, JSON.stringify(r));
await db.exec("reset role");
r = await q("select public, file_size_limit from storage.buckets where id='unit-assets'"); check("bucket unit-assets: leitura pública e limite de 2 MB", r.rows[0]?.public === true && Number(r.rows[0]?.file_size_limit) === 2097152, JSON.stringify(r.rows));

console.log("\n[agenda: agendamentos e bloqueios]");
await asServer();
const bA2 = (await db.query("insert into barbers (unit_id, full_name, display_name) values ($1,'Carlos Lima','Carlos') returning id", [A])).rows[0].id;
const sAg = (await db.query("insert into services (unit_id, name, category, duration_minutes, price_cents) values ($1,'Corte agenda','cabelo',30,4500) returning id", [A])).rows[0].id;
const T = (h, m = 0) => `2026-10-20T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
const APPT = "insert into appointments (unit_id, barber_id, customer_name, customer_phone, starts_at, ends_at) values ($1,$2,$3,$4,$5,$6) returning id, created_by, created_by_name, kind, status";
const BLOCK = "insert into appointments (unit_id, barber_id, kind, starts_at, ends_at, notes) values ($1,$2,'block',$3,$4,$5) returning id";
const SVC = [{ service_id: sAg, name: "Corte", duration_minutes: 30, price_cents: 4500 }, { service_id: sAg, name: "Barba", duration_minutes: 20, price_cents: 3000 }];
const DATA = (o = {}) => JSON.stringify({ unit_id: A, barber_id: bA, customer_name: "Cliente Teste", customer_phone: "11999990000", starts_at: T(13), ends_at: T(14), notes: "obs", ...o });
const SAVE = "select public.save_appointment($1::uuid, $2::jsonb, $3::jsonb) as id";

await as(recepA);
r = await q(APPT, [A, bA, "Cliente Um", "11999990001", T(13), T(14)]);
check("recepção A cria agendamento na própria unidade", !r.err && r.rows.length === 1, r.err);
const apA = r.rows[0]?.id;
check("autor é preenchido pela sessão (created_by)", r.rows[0]?.created_by === recepA, JSON.stringify(r.rows[0]));
check("nome do autor gravado", !!r.rows[0]?.created_by_name, JSON.stringify(r.rows[0]));
check("status inicial é 'agendado'", r.rows[0]?.status === "agendado");
r = await q(APPT, [A, bA, "Fraudador", "11999990001", T(13, 30), T(14, 30)]); check("sobreposição parcial para o mesmo profissional é rejeitada (23P01)", !!r.err && /conflicting|exclusion/i.test(r.err), r.err);
r = await q(APPT, [A, bA, "Dentro", "11999990001", T(13, 15), T(13, 45)]); check("agendamento dentro de outro é rejeitado", !!r.err);
r = await q(APPT, [A, bA, "Colado", "11999990001", T(14), T(14, 30)]); check("agendamento colado (começa quando o outro termina) é aceito", !r.err, r.err);
r = await q(APPT, [A, bA, "Antes", "11999990001", T(12, 30), T(13)]); check("agendamento que termina quando o outro começa é aceito", !r.err, r.err);
r = await q(APPT, [A, bA2, "Outro prof", "11999990001", T(13), T(14)]); check("outro profissional pode atender no mesmo horário", !r.err, r.err);
r = await q(APPT, [A, bA, "Fim antes", "11999990001", T(16), T(15)]); check("fim antes do início é rejeitado", !!r.err);
r = await q(APPT, [A, bA, "Longo", "11999990001", T(17), "2026-10-21T06:00:00Z"]); check("duração acima de 12 h é rejeitada", !!r.err);
r = await q(APPT, [A, bA, "X", "11999990001", T(18), T(19)]); check("nome do cliente com 1 letra é rejeitado", !!r.err);
r = await q(APPT, [A, bA, "Telefone ruim", "123", T(18), T(19)]); check("telefone inválido é rejeitado", !!r.err);
r = await q(APPT, [A, bB, "Prof de B", "11999990001", T(18), T(19)]); check("profissional de outra unidade é rejeitado (FK composta)", !!r.err);
r = await q(APPT, [B, bB, "Unidade B", "11999990001", T(13), T(14)]); check("recepção A NÃO cria agendamento na unidade B", !!r.err);
r = await q("insert into appointments (unit_id, barber_id, starts_at, ends_at) values ($1,$2,$3,$4)", [A, bA, T(19), T(20)]); check("agendamento sem nome de cliente é rejeitado", !!r.err);
r = await q("insert into appointments (unit_id, barber_id, created_by, customer_name, starts_at, ends_at) values ($1,$2,$3,'Fulano',$4,$5)", [A, bA, barbA, T(19), T(20)]);
check("NÃO grava autor direto (sem privilégio de coluna; o trigger define)", !!r.err);

console.log("  -- bloqueios");
r = await q(BLOCK, [A, bA, T(15), T(16), "Médico"]); check("recepção A cria bloqueio", !r.err && r.rows.length === 1, r.err);
const blkA = r.rows[0]?.id;
r = await q(APPT, [A, bA, "Sobre bloqueio", "11999990001", T(15, 30), T(16, 30)]); check("agendamento sobre bloqueio é rejeitado", !!r.err);
r = await q(BLOCK, [A, bA, T(15, 30), T(16, 30), "Outro"]); check("bloqueio sobre bloqueio é rejeitado", !!r.err);
r = await q(BLOCK, [A, bA, T(13), T(14), "Sobre agendamento"]); check("bloqueio sobre agendamento é rejeitado", !!r.err);
r = await q("insert into appointments (unit_id, barber_id, kind, customer_name, starts_at, ends_at) values ($1,$2,'block','Fulano',$3,$4)", [A, bA, T(21), T(22)]); check("bloqueio com nome de cliente é rejeitado", !!r.err);
r = await q("insert into appointments (unit_id, barber_id, kind, status, starts_at, ends_at) values ($1,$2,'block','concluido',$3,$4)", [A, bA, T(21), T(22)]); check("bloqueio com status diferente de 'agendado' é rejeitado", !!r.err);
r = await q("delete from appointments where id=$1", [blkA]); check("recepção A remove bloqueio", r.n === 1 && !r.err, JSON.stringify(r));
r = await q("delete from appointments where id=$1", [apA]); check("agendamento NÃO pode ser apagado (só cancelado)", r.n === 0 || !!r.err);

console.log("  -- status");
r = await q("update appointments set status='cancelado' where id=$1", [apA]); check("cancelar agendamento libera o horário", r.n === 1 && !r.err, r.err);
r = await q(APPT, [A, bA, "Ocupa de novo", "11999990001", T(13), T(14)]); check("horário liberado aceita outro agendamento", !r.err, r.err);
const apA2 = r.rows[0]?.id;
r = await q("update appointments set status='agendado' where id=$1", [apA]); check("reabrir sobre horário ocupado é rejeitado", !!r.err);
r = await q("update appointments set status='faltou' where id=$1", [apA2]); check("marcar falta libera o horário", r.n === 1 && !r.err);
r = await q("update appointments set status='agendado' where id=$1", [apA2]); check("reabrir com horário livre funciona", r.n === 1 && !r.err, r.err);
r = await q("update appointments set status='inventado' where id=$1", [apA2]); check("status inválido é rejeitado", !!r.err);
r = await q("update appointments set unit_id=$1 where id=$2", [B, apA2]); check("NÃO muda unit_id (sem privilégio de coluna)", !!r.err);
r = await q("update appointments set kind='block' where id=$1", [apA2]); check("NÃO muda o tipo (sem privilégio de coluna)", !!r.err);
r = await q("update appointments set created_by=$1 where id=$2", [barbA, apA2]); check("NÃO muda o autor (sem privilégio de coluna)", !!r.err);
r = await q("update appointments set starts_at=$1, ends_at=$2 where id=$3", [T(17), T(18), apA2]); check("remarcar para horário livre funciona", r.n === 1 && !r.err, r.err);
r = await q("update appointments set barber_id=$1 where id=$2", [bB, apA2]); check("NÃO move para profissional de outra unidade", !!r.err);
r = await q("update appointments set barber_id=$1 where id=$2", [bA2, apA2]); check("troca de profissional na mesma unidade funciona", r.n === 1 && !r.err, r.err);

console.log("  -- save_appointment (atômico)");
r = await q(SAVE, [null, DATA({ starts_at: T(9), ends_at: T(10) }), JSON.stringify(SVC)]); check("RPC cria agendamento com 2 serviços", !r.err && !!r.rows[0]?.id, r.err);
const rpcId = r.rows[0]?.id;
r = await q("select position, name, duration_minutes, price_cents from appointment_services where appointment_id=$1 order by position", [rpcId]);
check("serviços gravados em ordem com a foto (nome, duração, preço)", r.rows.length === 2 && r.rows[0].name === "Corte" && r.rows[1].position === 1 && r.rows[1].price_cents === 3000, JSON.stringify(r.rows));
r = await q(SAVE, [null, DATA({ starts_at: T(9, 30), ends_at: T(10, 30), customer_name: "Conflito" }), JSON.stringify(SVC)]); check("RPC em horário ocupado falha", !!r.err);
r = await q("select count(*)::int c from appointments where customer_name='Conflito'"); check("RPC com conflito não deixa agendamento órfão", r.rows[0].c === 0);
r = await q(SAVE, [rpcId, DATA({ starts_at: T(9, 15), ends_at: T(10, 15), customer_name: "Editado" }), JSON.stringify([SVC[0]])]); check("RPC edita o próprio agendamento (mesmo se sobrepõe a si mesmo)", !r.err, r.err);
r = await q("select count(*)::int c, max(customer_name) n from appointment_services s join appointments a on a.id=s.appointment_id where a.id=$1", [rpcId]); check("edição troca os serviços (1 restante) e o nome", r.rows[0].c === 1 && r.rows[0].n === "Editado", JSON.stringify(r.rows));
r = await q(SAVE, [rpcId, DATA({ starts_at: T(9, 15), ends_at: T(10, 15) }), "[]"]); check("RPC sem serviços é rejeitada", !!r.err);
r = await q("select count(*)::int c from appointment_services where appointment_id=$1", [rpcId]); check("RPC rejeitada não apaga os serviços existentes", r.rows[0].c === 1);
r = await q(SAVE, [null, DATA({ unit_id: B, barber_id: bB, starts_at: T(9), ends_at: T(10) }), JSON.stringify(SVC)]); check("RPC NÃO cria na unidade B (RLS)", !!r.err);
r = await q(SAVE, [null, DATA({ starts_at: T(8), ends_at: T(8, 30) }), JSON.stringify([{ ...SVC[0], service_id: sB }])]); check("RPC com serviço de outra unidade é rejeitada (FK composta)", !!r.err);
r = await q(SAVE, [crypto.randomUUID(), DATA(), JSON.stringify(SVC)]); check("RPC com id inexistente falha", !!r.err);
r = await q("delete from appointment_services where appointment_id=$1", [rpcId]); check("recepção A apaga os serviços (usado pela RPC ao editar)", !r.err);
r = await q("update appointment_services set price_cents=1 where appointment_id=$1", [rpcId]); check("serviços do agendamento NÃO são editados direto (sem UPDATE)", !!r.err || r.n === 0);
await q(SAVE, [rpcId, DATA({ starts_at: T(9, 15), ends_at: T(10, 15), customer_name: "Editado" }), JSON.stringify(SVC)]);

console.log("  -- visibilidade");
r = await q("select id from appointments"); check("recepção A só vê a unidade A", r.rows.length > 0 && (await q("select id from appointments where unit_id=$1", [B])).rows.length === 0);
await asServer();
await db.query("insert into appointments (unit_id, barber_id, customer_name, starts_at, ends_at) values ($1,$2,'Da unidade B',$3,$4)", [B, bB, T(13), T(14)]);
await db.query("insert into appointments (unit_id, barber_id, kind, starts_at, ends_at) values ($1,$2,'block',$3,$4)", [A, bA2, T(22), T(23)]);
await as(recepA);
r = await q("select id from appointments where customer_name='Da unidade B'"); check("recepção A NÃO vê agendamento da unidade B", r.rows.length === 0);
r = await q("update appointments set status='cancelado' where customer_name='Da unidade B'"); check("recepção A NÃO altera agendamento da unidade B", r.n === 0);
await as(recepB);
r = await q("select id from appointments where customer_name='Da unidade B'"); check("recepção B vê o agendamento da própria unidade", r.rows.length === 1);
r = await q("select id from appointments where unit_id=$1", [A]); check("recepção B NÃO vê a unidade A", r.rows.length === 0);
await as(barbA);
r = await q("select customer_name, barber_id from appointments"); check("barbeiro A vê só os próprios horários (profissional João)", r.rows.length > 0 && r.rows.every((x) => x.barber_id === bA), JSON.stringify(r.rows.length));
r = await q("select id from appointments where barber_id=$1", [bA2]); check("barbeiro A NÃO vê os horários de outro profissional", r.rows.length === 0);
r = await q("select s.name from appointment_services s"); check("barbeiro A vê os serviços dos próprios agendamentos", r.rows.length > 0 && !r.err, r.err);
r = await q(APPT, [A, bA, "Barbeiro cria", "11999990001", T(23), T(23, 30)]); check("barbeiro NÃO cria agendamento", !!r.err);
r = await q("update appointments set status='concluido' where barber_id=$1", [bA]); check("barbeiro NÃO altera agendamento (nesta etapa)", r.n === 0 || !!r.err);
r = await q("delete from appointments where kind='block'"); check("barbeiro NÃO apaga bloqueio", r.n === 0 || !!r.err);
await as(nobody);
r = await q("select id from appointments"); check("usuário sem papel não vê agendamentos", r.rows.length === 0);
await as(null);
r = await q("select id from appointments"); check("anônimo não lê agendamentos", !!r.err || r.rows.length === 0);
r = await q("select id from appointment_services"); check("anônimo não lê serviços dos agendamentos", !!r.err || r.rows.length === 0);
await as(adm);
r = await q("select id from appointments"); check("admin vê agendamentos de todas as unidades", r.rows.length > 0 && (await q("select id from appointments where unit_id=$1", [B])).rows.length > 0);
r = await q(APPT, [B, bB, "Admin cria", "11999990001", T(10), T(11)]); check("admin cria agendamento em qualquer unidade", !r.err, r.err);
await asServer();
r = await q("delete from barbers where id=$1", [bA2]); check("apagar profissional leva seus agendamentos junto (cascade)", !r.err && (await q("select id from appointments where barber_id=$1", [bA2])).rows.length === 0, r.err);

console.log("\n[unidade B desativada]");
await asServer();
await db.query("update units set is_active=false where id=$1", [B]);
await as(recepB);
r = await q("select id from units"); check("recepção B perde acesso", r.rows.length === 0);
r = await q("select id from customers"); check("recepção B perde acesso aos clientes (unidade inativa)", r.rows.length === 0, r.rows.length);
r = await q("select id from customer_notes"); check("recepção B perde acesso às observações (unidade inativa)", r.rows.length === 0, r.rows.length);
await as(adm);
r = await q("select id from units where id=$1", [B]); check("admin ainda vê", r.rows.length === 1);

console.log("\n[tabela de comissão: troca atômica]");
const BR = "select public.replace_commission_brackets($1::jsonb) as n";
const brCount = async () => { await asServer(); return (await db.query("select count(*)::int c from commission_brackets")).rows[0].c; };
const before = await brCount();
await as(recepA);
r = await q(BR, [JSON.stringify([{ min_cents: 0, max_cents: null, pct: 50 }])]); check("recepção NÃO troca a tabela", !!r.err);
check("tabela intacta após recusa da recepção", (await brCount()) === before, before);
await as(adm);
r = await q(BR, [JSON.stringify([{ min_cents: 0, max_cents: 1000, pct: 20 }, { min_cents: 5000, max_cents: null, pct: 30 }])]);
check("tabela com buraco é rejeitada", !!r.err);
r = await q(BR, [JSON.stringify([{ min_cents: 0, max_cents: 1000, pct: 20 }, { min_cents: 1001, max_cents: null, pct: 130 }])]);
check("percentual acima de 100 é rejeitado", !!r.err);
r = await q(BR, [JSON.stringify([])]); check("tabela vazia é rejeitada", !!r.err);
check("falha no meio NÃO apaga a tabela anterior", (await brCount()) === before, before);
await as(adm);
r = await q(BR, [JSON.stringify([{ min_cents: 0, max_cents: 1000, pct: 20 }, { min_cents: 1001, max_cents: null, pct: 30.5 }])]);
check("admin troca a tabela inteira", r.rows[0]?.n === 2 && !r.err, r.err);
check("tabela nova tem só as 2 faixas", (await brCount()) === 2);

console.log("\n[saldo de pacote: trava]");
await asServer();
r = await q("select prosrc from pg_proc where proname = 'replace_ticket_items'");
check("replace_ticket_items trava os pacotes (for update) antes de conferir o saldo",
  /customer_packages[\s\S]*for update[\s\S]*delete from public\.ticket_items/.test(r.rows[0]?.prosrc ?? ""));

console.log(`\n${total - fail}/${total} ok`);
process.exit(fail ? 1 : 0);

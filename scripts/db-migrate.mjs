// Aplica supabase/migrations/*.sql no Postgres do Supabase (nuvem), em ordem,
// registrando o que já foi aplicado em supabase_migrations.schema_migrations
// (mesma tabela da Supabase CLI, então é compatível com `supabase db push`).
//
// Uso: npm run db:migrate        (lê SUPABASE_DB_URL do .env.local)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "SUPABASE_DB_URL não definida no .env.local.\n" +
      "Alternativa sem senha de banco: rode `npm run db:bundle` e cole o SQL gerado no SQL Editor do Supabase.",
  );
  process.exit(1);
}

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query("create schema if not exists supabase_migrations");
  await client.query(`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    )`);
  const { rows } = await client.query(
    "select version from supabase_migrations.schema_migrations",
  );
  const applied = new Set(rows.map((r) => r.version));

  let count = 0;
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    if (applied.has(version)) {
      console.log(`= já aplicada: ${file}`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    console.log(`> aplicando:   ${file}`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [version, rest.join("_"), [sql]],
      );
      await client.query("commit");
      count++;
    } catch (err) {
      await client.query("rollback");
      console.error(`x falhou em ${file}: ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) console.log(`\nConcluído. ${count} migration(s) nova(s).`);
} catch (err) {
  console.error(`Erro de conexão: ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

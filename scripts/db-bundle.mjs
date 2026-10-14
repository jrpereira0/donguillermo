// Junta todas as migrations num único arquivo para colar no SQL Editor do
// Supabase (alternativa a `npm run db:migrate`, sem precisar da senha do banco).
//
// Uso: npm run db:bundle  ->  supabase/_bundle.sql (ignorado pelo Git)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const out = files
  .map((f) => `-- ===== ${f} =====\n${readFileSync(join(dir, f), "utf8").trim()}\n`)
  .join("\n");

const target = join(process.cwd(), "supabase", "_bundle.sql");
writeFileSync(target, out);
console.log(`Gerado: supabase/_bundle.sql (${files.length} migrations).`);
console.log("Cole o conteúdo no Supabase > SQL Editor > New query > Run.");
console.log("Atenção: rode o bundle uma única vez num banco limpo (as migrations não são idempotentes).");

// Inicia o `next dev` com limite maior para o tamanho dos cabeçalhos HTTP.
//
// Por quê: cookies de `localhost` são compartilhados entre TODAS as portas.
// Depois de rodar vários projetos (cada um com sessão/tokens), o navegador manda
// um cabeçalho `Cookie` enorme e o Node (limite padrão de 16 KB) responde
// "HTTP ERROR 431". Em produção isso não acontece (domínio próprio).
//
// Uso: `npm run dev` (já chama este arquivo). Funciona no Windows, Mac e Linux.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const flag = "--max-http-header-size=65536"; // 64 KB
const env = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, flag].filter(Boolean).join(" "),
};

const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
child.on("exit", (code) => process.exit(code ?? 0));

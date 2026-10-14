import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` lança erro fora do Next; nos testes vira um módulo vazio.
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Por que `vmThreads`: no Windows, quando o terminal abre a pasta como `c:\...`
    // (letra minúscula, caso do terminal do Cursor), o Vitest carrega o próprio
    // pacote duas vezes (`c:/` e `C:/` viram caminhos diferentes) e todo teste
    // quebra com "Cannot read properties of undefined (reading 'config')".
    // Neste pool cada arquivo roda em um contexto isolado e o problema não ocorre.
    // Nossos testes são unitários e pequenos, então o custo é irrelevante.
    pool: "vmThreads",
  },
});

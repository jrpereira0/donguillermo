import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Só em desenvolvimento: permite abrir o site pelo IP da rede local (ex.: o
  // "Network" que o `next dev` mostra, 192.168.x.x). Sem isso o Next 16 bloqueia
  // o HMR e os recursos de dev dessa origem e a página pode ficar sem interação.
  // Não tem efeito em produção.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*"],
  turbopack: {
    // Fixa a raiz no projeto: existe outro package-lock.json fora dele (na pasta do usuário)
    // e o Next o confundia com a raiz do workspace.
    root: path.resolve(import.meta.dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

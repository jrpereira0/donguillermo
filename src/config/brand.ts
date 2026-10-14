/**
 * Identidade da marca (textos e logo). Cores e fontes ficam em
 * src/app/globals.css (tokens) e src/app/layout.tsx (next/font).
 *
 * Quando o logo oficial chegar: coloque o arquivo em /public/brand/ e
 * preencha `logoSrc`. Enquanto for `null`, o sistema mostra só o nome.
 */
export const brand = {
  name: "Don Guillermo",
  tagline: "Barbearia",
  logoSrc: null as string | null,
  /** Logo quadrado (branco, para fundo escuro). Usado nas telas de acesso. */
  logoSquareSrc: "/logobranco-quadrado.svg" as string | null,
} as const;

# Identidade visual e tokens

A identidade foi extraída da referência enviada (tela de comissão do profissional parceiro): tema **escuro**, destaque **dourado**, textos em **creme**, títulos condensados em caixa alta e rótulos com espaçamento largo.

## Cores

| Token | Valor | Uso |
|---|---|---|
| `--brand-bg` | `#101010` | Fundo da página |
| `--brand-surface` | `#242424` | Cartões, campos |
| `--brand-surface-2` | `#343433` | Trilhas de barra, hover, `accent` |
| `--brand-border` | `#454443` | Bordas |
| `--brand-gold` | `#C0A062` | Cor primária: botões, valores de destaque, foco |
| `--brand-gold-hover` | `#CDB078` | Hover do dourado |
| `--brand-cream` | `#F2EDE4` | Texto principal e números grandes |
| `--brand-muted` | `#A3A19E` | Texto secundário |
| `--brand-danger` | `#E5604D` | Erros |
| `--brand-success` | `#8FBF6A` | Sucesso |

Os valores foram medidos por amostragem de pixels da imagem de referência (fundo, cartão, botão dourado, creme, borda e trilha). Os de apoio (`gold-hover`, `muted`, `danger`, `success`) são estimativas e podem ser ajustados.

## Tipografia

| Papel | Fonte | Classe Tailwind |
|---|---|---|
| Títulos e números de destaque | **Oswald** (condensada, bold) | `font-heading` (já aplicada em `h1`–`h3`) |
| Rótulos em caixa alta ("COMISSÃO DO MÊS") | **Montserrat** | `font-label` / `.label-caps` |
| Corpo de texto | **Inter** | `font-sans` (padrão) |

As fontes são carregadas por `next/font/google` em `src/app/layout.tsx` e ligadas aos tokens `--font-heading`, `--font-label` e `--font-sans`. Se você tiver os arquivos de fonte oficiais, é só trocar nesse arquivo.

> Oswald e Montserrat foram identificadas **visualmente** pela imagem. Se a marca usa outras fontes, informe o nome.

## Classes utilitárias da marca

- `.label-caps`: rótulo pequeno, caixa alta, espaçamento largo, cor atenuada.
- `.display-number`: valor grande em Oswald bold (ex.: `R$ 5.780`).

## Como trocar a identidade

1. **Cores**: edite o bloco `:root` em `src/app/globals.css`. Os tokens semânticos do shadcn (`--primary`, `--card`...) apontam para os `--brand-*`, então mudar a marca atualiza tudo.
2. **Fontes**: edite `src/app/layout.tsx` (troque `Oswald`/`Montserrat`/`Inter`).
3. **Logo e nome**: coloque o arquivo em `public/brand/` e preencha `logoSrc` em `src/config/brand.ts`.

Nenhum componente usa cor fixa (hex) diretamente; todos usam tokens.

## Tema

O sistema é **escuro apenas** (`color-scheme: dark`). Não há alternância claro/escuro.

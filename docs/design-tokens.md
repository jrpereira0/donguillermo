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

## Componentes base

Os componentes shadcn foram ajustados para a identidade (só por tokens):

- **Button**: rótulo em Montserrat, caixa alta, espaçamento largo. `default` é dourado cheio; `outline` é contorno dourado sobre cartão (como "Atualizar meus dados" na referência). Altura 44 px (`lg`: 48 px).
- **Input**: fundo `--brand-surface`, borda `--brand-border`, foco dourado, altura 44 px.
- **Label**: estilo `.label-caps`.

## Padrões de interface ("luxe")

Acabamentos aprovados que valem para o sistema inteiro. Quando precisar de um
elemento deste tipo, **use o padrão** em vez de criar outro.

### 1. Botão de ação principal: `<Button variant="luxe">`

Degradê dourado, leve elevação no hover, **reflexo de luz que varre o botão** e, se
quiser, uma seta que desliza. Use para a ação principal da tela ("Entrar", "Salvar",
"Confirmar", "Finalizar venda"). Uma por tela/formulário.

```tsx
<Button variant="luxe" size="lg" className="w-full">
  Entrar
  <ArrowRight className="transition-transform duration-300 group-hover/button:translate-x-1" />
</Button>
```

- Implementação: variante `luxe` em `src/components/ui/button.tsx` + classe `.btn-luxe` em `globals.css`.
- Ações secundárias continuam em `outline`/`ghost`; `default` é o dourado liso.

### 2. Card de destaque com borda animada: `<LuxeFrame>`

Vidro escuro, moldura em degradê dourado e um **brilho dourado que gira na borda**.
Use em cards principais (login, resumos importantes), não em todo card da tela.

```tsx
<LuxeFrame contentClassName="p-8">...conteúdo...</LuxeFrame>
```

- Implementação: `src/components/ui/luxe-frame.tsx` + classes `.luxe-frame`/`.luxe-card` em `globals.css`.
- `className` vai na moldura (ex.: `reveal` para a animação de entrada); `contentClassName` no miolo (padding).

### 3. Outros acabamentos (em `globals.css`)

| Classe | Uso |
|---|---|
| `.field-luxe` | Campo de texto escuro com brilho dourado ao focar (login) |
| `.link-luxe` | Link discreto com sublinhado dourado que cresce do centro |
| `.reveal` + `style={{ "--d": "300ms" }}` | Entrada escalonada (sobe e desfoca → nítido) |
| `.shake` | Tremida do aviso de erro (já aplicada em `FormAlert tone="error"`) |
| `OrnamentDivider` | Filete dourado com losango (`src/components/brand/ornament-divider.tsx`) |
| `.alert-luxe` (via `<FormAlert tone="error\|success\|info">`) | Aviso simples: fundo escuro, borda fina na cor do tom, texto creme e um ícone de linha (lucide). Sem emojis, sem selo colorido |
| `AuthHeading` | Cabeçalho padrão das telas de acesso: eyebrow dourado, título em degradê, filete e descrição (`src/components/auth/auth-heading.tsx`) |

### Telas de acesso: receita padrão

Todas as telas dentro de `(auth)` (login, esqueci a senha, definir senha, link inválido) seguem a mesma receita:

1. Cabeçalho com `<AuthHeading eyebrow title description />`.
2. Campos com `field-luxe` + ícone à esquerda (`Mail`, `LockKeyhole`), em blocos `reveal` com atrasos 650 / 760 / 880 ms.
3. Botão principal `<Button variant="luxe" size="lg" className="w-full">` com `ArrowRight` que desliza (`group-hover/button:translate-x-1`). Para link com aparência de botão: `buttonVariants({ variant: "luxe", size: "lg" })`.
4. Links secundários ("Esqueci minha senha", "Voltar ao login") com `label-caps link-luxe reveal self-center py-1`.

### Regras

- **Sem luzes de fundo**: o fundo das telas é liso (`--brand-bg`). Nada de brilhos/orbes atrás do conteúdo.
- **Login sem rolagem**: o layout de acesso ocupa a altura da janela (`h-dvh`) e dimensiona logo e espaços por `vh`; verificado em 1920×1080, 1366×600, 390×700 e 360×600. Ao criar novos campos nessas telas, mantenha o conteúdo enxuto.
- **Movimento reduzido**: todas as animações são desligadas para quem usa `prefers-reduced-motion`.
- Esses acabamentos usam tons derivados do dourado da marca (`rgb(192 160 98 / x)`), definidos em `globals.css`. Se o dourado da marca mudar, ajuste esses valores junto com `--brand-gold`.

### Área da unidade (recepção): peças reutilizáveis

As telas de `/u/<slug>/*` usam estas peças. Antes de criar outra, reaproveite.

| Peça | Onde | Uso |
|---|---|---|
| `UnitShell` + `UnitSidebar` | `src/components/unit/` | Moldura da unidade: menu lateral (recolhe no celular) com a marca, unidade, e-mail e **Sair**. A borda dourada fina vem de `.sidebar-edge` (`globals.css`). Os itens do menu saem de `nav.ts` por papel |
| `PageHeader` | `src/components/unit/page-header.tsx` | Eyebrow, título e descrição da página, com área de ações |
| `ComingSoon` | `src/components/unit/coming-soon.tsx` | Página "Em breve" dos módulos ainda não construídos |
| `FormSection` / `Field` | `src/components/unit/form-parts.tsx` | Bloco de formulário com título e campo com rótulo, dica e erro no padrão (erro some ao corrigir) |
| `TabList` | `src/components/unit/tab-list.tsx` | Abas da ficha (cadastros de profissional e cliente). Ids `<ficha>-tab-<id>` e `<ficha>-panel-<id>`; teclado e acessibilidade já tratados |
| `Select`, `Switch`, `Textarea` | `src/components/ui/` | Campos no padrão da marca (lista própria, não o `<select>` do navegador) |
| `PhotoUploader` + `PhotoCropper` | `src/components/unit/` | Envio de foto com recorte, compressão em WebP e caminho configurável (`buildPath`) para cada bucket |
| `Notice` / `FlashNotice` | `src/components/ui/notice.tsx` | Aviso de sucesso que aparece no canto, fecha sozinho e tem botão de fechar. `FlashNotice` lê `?aviso=` depois de um redirecionamento (ex.: cadastro criado) |
| `FormAlert` | `src/components/auth/` | Aviso dentro do formulário (erro, sucesso, informação) |
| `LuxeFrame` | `src/components/ui/luxe-frame.tsx` | Estados vazios e cartões de destaque ("Nenhum cliente cadastrado") |

Padrões de lista: **tabela** em telas largas (`xl`) e **cartões** no celular, com o link da linha cobrindo o cartão inteiro (`stretched link`) e os botões de ação por cima; busca no servidor com pausa antes de filtrar; selo de status (Ativo/Inativo) com `Badge`. Mensagens de sucesso de ações que não saem da página usam `Notice`; as que redirecionam usam `FlashNotice`.

Regras de texto: português correto com acentos, sem emojis, ícones de linha (lucide), mensagens de erro genéricas para quem não deve saber detalhes (segurança) e claras no campo para quem preenche.

## Como trocar a identidade

1. **Cores**: edite o bloco `:root` em `src/app/globals.css`. Os tokens semânticos do shadcn (`--primary`, `--card`...) apontam para os `--brand-*`, então mudar a marca atualiza tudo.
2. **Fontes**: edite `src/app/layout.tsx` (troque `Oswald`/`Montserrat`/`Inter`).
3. **Logo e nome**: coloque o arquivo em `public/` e aponte em `src/config/brand.ts`: `logoSquareSrc` (logo quadrado, usado nas telas de acesso, hoje `/logobranco-quadrado.svg`) e `logoSrc` (logo horizontal para o cabeçalho; ainda `null`, o cabeçalho mostra o nome em texto).

Nenhum componente usa cor fixa (hex) diretamente; todos usam tokens.

## Tema

O sistema é **escuro apenas** (`color-scheme: dark`). Não há alternância claro/escuro.

# ADR 0002 — Convenções do Next.js 16 (proxy e Cache Components)

- **Status**: aceita
- **Data**: 2026-10-13

## Contexto

O projeto foi gerado com Next.js 16, que tem mudanças em relação a versões anteriores: o `middleware` foi renomeado para `proxy` e o `create-next-app` habilita Cache Components por padrão.

## Decisão

- Usar `src/proxy.ts` (função `proxy`) para renovar a sessão do Supabase e, na Etapa 4, aplicar regras de acesso.
- Manter `cacheComponents: true`. Dados dinâmicos (cookies, consultas ao vivo) ficam em componentes dentro de `<Suspense>` ou após `await connection()`; não se usa `export const dynamic`.
- O proxy é só a **primeira** barreira: cada página/rota valida o papel de novo no servidor.

## Consequências

- Alinhado à direção do framework.
- Páginas autenticadas precisam de fronteiras `<Suspense>` explícitas.
- O plano menciona "middleware"; leia como "proxy".

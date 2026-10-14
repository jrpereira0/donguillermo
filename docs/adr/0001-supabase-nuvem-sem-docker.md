# ADR 0001 — Supabase na nuvem para desenvolvimento, sem Docker

- **Status**: aceita
- **Data**: 2026-10-13

## Contexto

O ambiente de desenvolvimento não tem Docker, o que inviabiliza o Supabase local (`supabase start`). Também decidimos não publicar na Vercel nesta fase.

## Decisão

- Usar um **projeto Supabase na nuvem (plano gratuito)** como ambiente de desenvolvimento.
- A aplicação roda só em `localhost`.
- Schema versionado em `supabase/migrations/`, aplicado ao projeto de desenvolvimento. Um projeto separado será criado para produção.
- Segredos só em `.env.local` (fora do Git).

## Consequências

- Sem dependência de Docker; setup simples.
- Dados de desenvolvimento ficam na nuvem: não usar dados reais de clientes.
- O plano gratuito pausa projetos inativos; pode ser preciso reativar.
- Migrations devem ser aplicáveis a qualquer projeto limpo (reprodutibilidade para produção).

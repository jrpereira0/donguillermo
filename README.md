# Don Guillermo — Sistema de gestão

Sistema multi-unidade para a rede de barbearias Don Guillermo: agenda, comandas, caixa, comissões e cadastros, com isolamento por unidade garantido por RLS no Supabase.

**Stack:** Next.js 16 (App Router) + TypeScript · Tailwind + shadcn/ui (tema em tokens) · Supabase (Auth, Postgres, RLS) · Zod.

## Começar

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do seu projeto Supabase
npm run dev
```

Abra <http://localhost:3000>. Guia completo em [docs/setup.md](docs/setup.md).

> Ambiente atual: apenas `localhost` (sem deploy na Vercel). Nunca commite o `.env.local`.

## Documentação

Veja [docs/README.md](docs/README.md): arquitetura, tokens de design, segurança e convenções.

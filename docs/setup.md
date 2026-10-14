# Setup local

Tudo roda em `localhost`. **Não há deploy na Vercel nesta fase** e **não usamos Docker**: o banco é um projeto Supabase na nuvem (plano gratuito) usado só para desenvolvimento.

## Requisitos

- Node 22+ e npm 10+
- Git
- Um projeto no [Supabase](https://supabase.com)

## Passo a passo

```bash
npm install
cp .env.example .env.local   # se ainda não existir
# preencha o .env.local (veja abaixo)
npm run dev
```

Abra <http://localhost:3000>. O cartão "Conexão com o Supabase" deve mostrar **Conectado**.

## Variáveis de ambiente (`.env.local`)

| Variável | Onde pegar | Pública? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase › Project Settings › API › Project URL | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase › Project Settings › API › anon / publishable key | Sim (a RLS protege os dados) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase › Project Settings › API › service_role / secret | **NÃO** — só servidor, ignora a RLS |
| `ADMIN_EMAIL` | E-mail do administrador da rede | Não |
| `SUPABASE_DB_URL` | (opcional) Supabase › Connect › Session pooler. Só para `npm run db:migrate` | **NÃO** — contém a senha do banco |
| `ADMIN_INITIAL_PASSWORD` | (opcional) senha inicial do admin no seed | **NÃO** |

O `.env.local` está no `.gitignore`. Só o `.env.example` (sem valores) é versionado. Detalhes em [seguranca.md](seguranca.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (valida tipos e rotas) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Gera tipos de rota e roda `tsc --noEmit` |
| `npm run db:migrate` | Aplica `supabase/migrations/*.sql` no Supabase (requer `SUPABASE_DB_URL`) |
| `npm run db:bundle` | Gera `supabase/_bundle.sql` para colar no SQL Editor (sem senha de banco) |
| `npm run db:seed` | Cria o admin da rede e 3 usuários de teste (credenciais em `.dev-credentials.local.md`) |
| `npm run test:rls:offline` | Testa a RLS num Postgres embutido (sem rede) |
| `npm run test:rls` | Testa a RLS no Supabase real (usuários temporários) |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:access` | Testa redirecionamento e acesso por papel (precisa do `npm run dev` rodando) |

## Banco de dados (Etapa 2)

Escolha **uma** das formas de aplicar as migrations:

**A) Automática** — coloque `SUPABASE_DB_URL` no `.env.local` (Supabase › botão *Connect* › *Session pooler*, trocando `[YOUR-PASSWORD]` pela senha do banco) e rode:

```bash
npm run db:migrate
npm run db:seed
npm run test:rls
```

**B) Manual (sem senha de banco)** — rode `npm run db:bundle`, abra `supabase/_bundle.sql`, copie tudo e cole em *Supabase › SQL Editor › New query › Run*. Depois `npm run db:seed` e `npm run test:rls` (estes usam só as chaves já configuradas).

Para conferir: *Supabase › Table Editor* deve mostrar `units`, `profiles` e `unit_members`, com a unidade **São Bernardo - Shopping Metrópole**.

## Verificação de saúde

`GET http://localhost:3000/api/health` retorna `200` quando o app alcança o Supabase com a anon key válida, e `503` caso contrário:

```json
{ "data": { "app": "ok", "supabase": { "state": "connected", "latencyMs": 24 } }, "meta": { "checkedAt": "..." } }
```

Estados possíveis de `supabase.state`: `connected`, `not_configured`, `invalid_key`, `unreachable`.

## Problemas comuns

- **"Não configurado"** na home: variável vazia no `.env.local`. Preencha e reinicie o `npm run dev` (o Next só lê o `.env.local` na partida).
- **"Chave recusada"**: a anon key está errada ou é de outro projeto.
- **"Sem conexão"**: a Project URL está errada, ou o projeto Supabase gratuito está pausado (reative no painel).
- **`npm audit` mostra 5 vulnerabilidades altas**: vêm de `eslint-config-next` (ferramenta de desenvolvimento, não roda em produção). O `--force` faria downgrade do Next, então não é aplicado; acompanhamos a correção upstream.

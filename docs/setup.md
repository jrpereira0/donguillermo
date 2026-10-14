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

O `.env.local` está no `.gitignore`. Só o `.env.example` (sem valores) é versionado. Detalhes em [seguranca.md](seguranca.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (valida tipos e rotas) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Gera tipos de rota e roda `tsc --noEmit` |

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

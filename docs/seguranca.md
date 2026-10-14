# Segurança

## Segredos e chaves

| Item | Regra |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Só no `.env.local`. **Nunca** em chat, e-mail, commit ou variável `NEXT_PUBLIC_*`. Ignora a RLS. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública por design. A proteção real é a RLS. |
| `.env.local` | Listado no `.gitignore` (padrão `.env*`, exceto `.env.example`). |
| `.env.example` | Versionado, **sem valores**. |

### Salvaguardas no código

- `src/lib/supabase/admin.ts` importa `server-only`: se alguém importar esse arquivo num Client Component, o **build falha**.
- `src/lib/env.ts` valida as variáveis com Zod e dá mensagens claras sem imprimir valores.
- `/api/health` devolve apenas estados (`connected`, `invalid_key`...), nunca chaves ou URLs completas.
- O proxy usa `supabase.auth.getUser()` (valida o token no servidor do Supabase), e não `getSession()`, que apenas lê o cookie.

### Se uma chave vazar

1. Supabase › Project Settings › API: gere/rotacione a chave afetada (no caso da service_role, é preciso rotacionar o JWT secret ou a secret key).
2. Atualize o `.env.local`.
3. Se foi commitada, trate como comprometida mesmo após remover do histórico.

## Princípios que guiam as próximas etapas

- Isolamento por unidade na **RLS**, não só na API.
- O redirecionamento e a autorização são decididos **no servidor**; o navegador nunca é a única barreira.
- Erros de login genéricos (não revelam se o e-mail existe).
- Usuários não se cadastram sozinhos; são convidados.

## Dependências

`npm audit` reporta 5 vulnerabilidades altas em `braces`/`micromatch`/`fast-glob`, todas **transitivas de `eslint-config-next`** (ferramenta de desenvolvimento; não entram no bundle nem rodam em produção). O `npm audit fix --force` sugerido faria downgrade para o Next 14 e não é aplicado. Reavaliar a cada atualização do Next.

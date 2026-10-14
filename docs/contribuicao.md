# Contribuição

## Fluxo

- Branch principal: `main`.
- **Cada etapa do plano vira um commit** (ou uma sequência curta de commits) para poder voltar atrás.
- Antes de commitar: `npm run lint && npm run typecheck && npm run build`.

## Convenção de commits ([Conventional Commits](https://www.conventionalcommits.org/pt-br))

```
<tipo>(<escopo>): <descrição curta no imperativo>
```

| Tipo | Uso |
|---|---|
| `feat` | Funcionalidade nova |
| `fix` | Correção de bug |
| `docs` | Somente documentação |
| `chore` | Ferramental, dependências, configuração |
| `refactor` | Mudança interna sem alterar comportamento |
| `test` | Testes |
| `db` | Migrations e seeds do banco |

Exemplos: `feat(etapa-1): fundação local com Next.js, tema e Supabase`, `db(etapa-2): unidades, perfis e RLS`.

## Idioma

- Interface e documentação: **português do Brasil**.
- Código (nomes de variáveis, tabelas, rotas de API): **inglês**, conforme o plano (`units`, `unit_members`, `/api/v1/...`).

## ADRs

Decisões de arquitetura ficam em `docs/adr/NNNN-titulo.md`. Veja o [modelo](adr/0000-modelo.md).

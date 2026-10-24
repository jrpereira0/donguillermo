# Painel da rede (admin)

Área do **administrador da rede**: `/admin`. É onde se cria e gerencia as unidades e o acesso da recepção de cada uma. Só o papel `admin_rede` entra (guard `requireNetworkAdmin`, validado no layout, em cada página e em cada action).

## Telas

| Rota | O que faz |
|---|---|
| `/admin` | Cartões das unidades (nome, endereço `/u/<slug>`, status Ativa/Inativa, recepção vinculada). Botões **Comissões** e **Nova unidade**; ativar/desativar |
| `/admin/comissoes` | Comissões da rede: tabela progressiva de serviços (faixas De/Até/%), % único de produtos e % próprio por profissional (campo vazio = segue a rede). Vale para todas as unidades |
| `/admin/unidades/nova` | Cria a unidade **e** o acesso da recepção de uma vez |
| `/admin/unidades/<slug>` | Gerencia a unidade: dados e horário de funcionamento, status, recepção (convidar, trocar senha, ativar/desativar vínculo) e link para a área da unidade |

## Criar uma unidade

Campos: nome, **slug** (endereço da unidade, sugerido a partir do nome; só `a-z`, `0-9` e `-`, 3 a 60 caracteres, único), endereço, telefone, **horário de funcionamento** (um dia por vez) e o acesso da recepção (e-mail, nome opcional, senha e confirmação).

Ordem das operações (`createUnitAction`):

1. Valida tudo **antes** de gravar, inclusive a senha, para não deixar unidade pela metade.
2. Cria a unidade com a sessão do admin (a RLS também confere). Slug repetido volta como erro no campo.
3. Provisiona a recepção com a `service_role` (`provisionReception`).
4. Se o passo 3 falhar, a unidade fica criada e a mensagem diz para criar o acesso pela página da unidade.

## Acesso da recepção

- Conta nova: criada já confirmada, **com a senha definida pelo admin** (sem e-mail de convite), política de senha forte igual à do restante do sistema.
- E-mail que já tem conta: só cria o vínculo; a senha informada é **ignorada** (para trocar senha existe "Alterar senha").
- Conta inativa não recebe acesso.
- **Alterar senha** e **ativar/desativar** o vínculo ficam na página da unidade. Desativar tira o acesso, mas guarda a conta e os dados.
- A `service_role` só é usada depois de `requireNetworkAdmin()`. Senhas nunca vão para log nem para o navegador depois de enviadas.

## Regras de validação (Zod, no servidor)

| Campo | Regra |
|---|---|
| Nome | 2 a 120 caracteres |
| Slug | `^[a-z0-9]+(-[a-z0-9]+)*$`, 3 a 60 caracteres; **não muda depois de criado** (é o endereço) |
| Endereço | Opcional, até 200 caracteres |
| Telefone | Opcional, até 30 caracteres, só números e `+ ( ) - .` |
| Horário | Por dia: aberto (HH:MM, abre antes de fechar), fechado ou não informado |
| E-mail da recepção | Formato válido, vira minúsculo |

## Segurança

- Toda action chama `requireNetworkAdmin()` de novo: o layout não protege chamadas diretas.
- Limite de operações por hora por administrador e mensagens genéricas de erro.
- Recepção e barbeiro que abrirem `/admin` caem em `/sem-acesso`. Ver [redirecionamento-por-papel.md](redirecionamento-por-papel.md).
- Unidade desativada: recepção e barbeiros dela perdem o acesso na hora (a RLS confere unidade ativa e não excluída). O admin continua vendo.

## Arquivos principais

| Caminho | Papel |
|---|---|
| `src/app/admin/{layout,page}.tsx`, `unidades/`, `comissoes/` | páginas do painel e o editor da tabela de comissões |
| `src/app/admin/actions.ts` | `createUnitAction`, `updateUnitAction`, `toggleUnitActiveAction`, `inviteReceptionAction`, `changeReceptionPasswordAction`, `toggleMemberActiveAction` |
| `src/lib/admin/{units,reception,state}.ts` | consultas, provisionamento da recepção (`service_role`) e estado dos formulários |
| `src/lib/validation/unit.ts` | slug, dados da unidade, senha e horário de funcionamento |
| `src/components/admin/*` | formulários da unidade, convite, senhas e `hours-fields` (horário por dia, reaproveitado no profissional) |

## Testes

- `npm test`: slug, dados da unidade, senha e horários (`unit.test.ts`).
- `npm run test:rls:offline` e `npm run test:rls`: quem lê e altera `units`, `profiles` e `unit_members`.
- `npm run test:access`: `/admin` só para o admin; recepção, barbeiro e sem papel são barrados.

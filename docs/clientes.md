# Clientes (cadastro único da rede)

Área da **recepção** (e do admin da rede): `/u/<slug>/clientes`. O cliente é **da rede**: o mesmo cadastro vale em qualquer unidade. A unidade onde ele foi cadastrado pela primeira vez fica registrada e nunca muda; a recepção de qualquer unidade vê e edita a ficha inteira.

## Telas

| Rota | O que faz |
|---|---|
| `/u/<slug>/clientes` | Lista com **busca no servidor** (nome sem acento, telefone, CPF, e-mail) e paginação de 20 por página. Tabela em telas largas, cartões no celular; a linha inteira abre a ficha. Mostra contato, **unidade de origem**, forma de cadastro (Recepção ou Autocadastro), data, status e ações (abrir, desativar/reativar). Rede sem clientes mostra o estado vazio |
| `/u/<slug>/clientes/novo` | Cadastro em uma etapa só (sem barra de abas) |
| `/u/<slug>/clientes/<id>` | Ficha com 4 abas: Dados pessoais, **Observações**, **Histórico** e **Situação** |

### Cadastro e aba "Dados pessoais"

- **Dados pessoais**: foto (mesmo fluxo do profissional, recorte redondo), nome completo, telefone (WhatsApp), e-mail, nascimento e CPF.
- **Endereço**: opcional, com busca por CEP (consulta no servidor, com limite de uso).
- **Como nos conheceu**: opcional (Indicação de amigo, Instagram, Facebook, Google, Passou em frente, Outro).
- **Comunicação**: interruptor de consentimento para receber promoções e lembretes. A data do consentimento é gravada quando liga e zerada quando desliga (LGPD); editar outros campos não muda essa data.

Só **nome e telefone** são obrigatórios. O restante é opcional de propósito: o autocadastro futuro (o próprio cliente, na página pública) pedirá poucos campos e usará a mesma tabela (`registered_via = 'autocadastro'`).

### Aba "Observações" (lista)

Cada cliente pode ter **várias observações**, escritas pela recepção de qualquer unidade (ou pelo admin).

- Caixa no topo para **adicionar** (até 1000 caracteres, com contador).
- Lista da mais recente para a mais antiga; cada item mostra **autor, unidade e data** e, se foi alterada, "editada em ...".
- **Editar** no próprio lugar (Salvar/Cancelar; Salvar fica desabilitado com texto vazio) e **excluir** com confirmação ("Excluir esta observação?").
- Aviso de sucesso da marca nas três ações (adicionada, atualizada, excluída). O aviso mora no componente pai, então aparece mesmo quando a observação excluída sai da lista.
- Qualquer recepção pode editar ou excluir qualquer observação do cliente (a ficha é da rede). O autor original e a unidade onde foi escrita nunca mudam.
- O cadastro novo não tem essa aba: a observação precisa do cliente já salvo.

### Aba "Histórico"

Resumo (**visitas, total gasto, ticket médio e última visita**, só com comandas fechadas) e lista de comandas **de todas as unidades**, cada uma com a unidade, o profissional, os itens, o status e o valor. As comandas ainda não existem: hoje a aba mostra "Nenhuma comanda ainda". Quando o módulo chegar, basta alimentar `listCustomerHistory` (`src/lib/customers/queries.ts`); o tipo `CustomerHistoryEntry` já define o formato.

### Aba "Situação"

Desativar/reativar. Não há exclusão: o cliente desativado some da agenda e das listas de escolha, mas o histórico continua. Exclusão ou anonimização por pedido do titular (LGPD) será uma rotina própria, feita pelo servidor.

## Regras de validação (Zod, no servidor; o formulário avisa ao sair do campo)

| Campo | Regra |
|---|---|
| Nome | Obrigatório, 2 a 120 caracteres |
| Telefone | Obrigatório. DDD + fixo de 8 ou celular de 9 dígitos, máscara `(11) 91234-5678`, guarda só dígitos. **Pode repetir** (famílias dividem o número) |
| E-mail | Opcional; formato válido; vira minúsculo |
| CPF | Opcional; 11 dígitos com dígitos verificadores (rejeita `111.111.111-11`); máscara `000.000.000-00`; guarda só dígitos. **Único na rede inteira** (CPF repetido mostra "Já existe um cliente com este CPF.") |
| Nascimento | Opcional; de 1900-01-01 até hoje. A ficha mostra a idade |
| CEP, rua, número, complemento, bairro, cidade, UF | Opcionais, mesmas regras do profissional (UF em maiúsculas, CEP com 8 dígitos) |
| Como conheceu | Opcional; uma das opções da lista |
| Observação | 1 a 1000 caracteres, não pode ser só espaços |

## Busca e lista

- A busca roda no servidor (`listCustomers`): a rede pode ter milhares de clientes, então não se filtra no navegador. Digitar atualiza `?q=` após uma pausa de 350 ms.
- O texto digitado é limpo antes de entrar no filtro do PostgREST (vírgula, parênteses e asteriscos mudariam o sentido da consulta). Nome usa a coluna `search_name` (gerada: minúsculas e sem acento), por isso "jose animo" acha "José Ânimo". Números (3 ou mais dígitos) buscam também em telefone e CPF.
- Ordem: ativos primeiro, depois por nome. Paginação por `?page=` com Anterior/Próxima e contagem total.
- A origem aparece pelo nome: a recepção não lê `units` de outras unidades, então os nomes vêm da função `network_units()`.

## Foto

- Mesmo fluxo da foto do profissional (arrastar/ampliar, recorte redondo, 400 px, WebP, alvo ~45 KB).
- Bucket `customer-photos` (público para leitura, limite 1 MB, webp/jpeg/png). Caminho **`<customer_id>.<ext>`**, sem pastas (o cliente é da rede, não de uma unidade). O id nasce na página de cadastro para o arquivo ter nome antes de o cliente existir.
- Admin e recepção de qualquer unidade gravam; barbeiro não. Trocar ou remover a foto apaga o arquivo antigo (melhor esforço). Cancelar um cadastro depois de enviar a foto deixa o arquivo solto no bucket (mesmo comportamento das outras imagens).

## Segurança (RLS)

| Quem | `customers` | `customer_notes` | Bucket `customer-photos` |
|---|---|---|---|
| admin da rede | lê, cadastra e edita (qualquer unidade) | lê, escreve, edita e exclui | grava |
| recepção de qualquer unidade | lê e edita todos; cadastra só com origem na **própria** unidade | lê todas; escreve só com a **própria** unidade; edita e exclui qualquer uma | grava |
| barbeiro | nada (dados do cliente na agenda virão por consultas específicas) | nada | nada |
| anônimo / sem papel | nada | nada | só lê a foto por URL pública |

- **Sem `DELETE` em `customers`**: o cliente é desativado. Observações podem ser excluídas; apagar o cliente (rotina do servidor) apaga as observações em cascata.
- **Origem imutável**: `created_unit_id`, `registered_via` e `created_at` não têm privilégio de `UPDATE`. A recepção só cadastra como `recepcao`; `autocadastro` será gravado pelo servidor (`service_role`).
- **Autoria à prova de forja**: `created_by` e `author_name` da observação são preenchidos por um gatilho a partir da sessão (`auth.uid()` + perfil). As colunas nem têm privilégio de `INSERT`, então ninguém assina como outra pessoa. Só o texto (`body`) é editável.
- Unidade inativa ou excluída tira o acesso da recepção dela, inclusive aos clientes.
- A unidade da ação vem sempre do guard (`requireUnitArea`), nunca do formulário; as actions têm limite de uso por hora e mensagens genéricas de erro.

## Arquivos principais

| Caminho | Papel |
|---|---|
| `supabase/migrations/20261014001400_customers.sql` | funções `is_any_reception` e `network_units`, tabela `customers`, RLS, bucket `customer-photos` |
| `supabase/migrations/20261014001500_customer_notes.sql` | tabela `customer_notes`, gatilho de autoria, RLS; migra e remove a coluna antiga `customers.notes` |
| `src/lib/validation/customer.ts` | CPF (validar/mascarar), origem, observação e `customerSchema` |
| `src/lib/customers/{types,queries,photo}.ts` | tipos, consultas (lista, ficha, observações, unidades, histórico) e caminho da foto |
| `src/app/u/[slug]/clientes/` | páginas (`page`, `novo`, `[id]`) e `actions.ts` |
| `src/components/unit/customer-*.tsx` | formulário, lista, busca, observações e histórico |

## Testes

- `npm test`: CPF, máscara, schema do cliente, observação e idade.
- `npm run test:rls:offline` e `npm run test:rls`: clientes, observações e fotos (papéis, origem imutável, CPF único, autoria, cascata, unidade inativa).
- `npm run test:e2e:clientes`: navegador real percorrendo validações, cadastro com foto (conferido no banco), CPF repetido, busca por nome/telefone/CPF/e-mail, paginação com 22 clientes, edição e remoção de foto, observações com avisos, histórico vazio, desativar/reativar, cliente visto por outra unidade (origem não muda), barbeiro barrado e celular. Precisa do app rodando (`npm run dev`); `HEADED=1` abre a janela. Cria e apaga duas unidades temporárias.

## Fora do escopo por enquanto

Autocadastro (página pública), preferência de profissional, comandas reais no histórico, exclusão/anonimização por pedido do titular e importação de clientes.

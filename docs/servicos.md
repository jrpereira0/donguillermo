# Serviços (catálogo da unidade)

Área da **recepção** (e do admin da rede): `/u/<slug>/servicos`. Cada serviço tem categoria, preço, duração padrão, imagem opcional e a lista de profissionais que o realizam (com duração própria opcional para cada um).

## Telas

| Rota | O que faz |
|---|---|
| `/u/<slug>/servicos` | Lista com busca (nome, categoria, descrição). Linha inteira abre a edição; mostra preço, duração, fotos de quem faz o serviço, status e ações (editar, ativar/desativar). Sem serviços, mostra o estado vazio com as categorias |
| `/u/<slug>/servicos/novo` | Cadastro em abas |
| `/u/<slug>/servicos/<id>` | Edição nas mesmas abas, mais a aba **Situação** |

### Abas

- **Dados do serviço**: imagem, nome, categoria e descrição (até 300 caracteres).
- **Preço e duração**: preço com máscara de R$ e duração (lista de 10 min a 3h). Um resumo mostra como o serviço aparece na lista.
- **Profissionais**: cartão por profissional ativo da unidade; tocar marca/desmarca. O marcado ganha o campo **Duração** (padrão do serviço ou outra, para quem leva mais ou menos tempo). "Marcar todos" / "Desmarcar todos".
- **Situação** (só na edição): desativar/reativar.

O cadastro de **Profissionais** tem a aba espelho **Serviços**: marca os serviços que o profissional faz e ajusta a duração de cada um. As duas telas leem e gravam a mesma tabela de ligação.

## Categorias

Ordem alfabética, "Outros" por último (`src/lib/validation/service.ts`, a lista é a fonte única; ícones em `src/components/unit/service-categories.ts`):

Barba, Cabelo, Combos, Massagem, Nariz, Orelha, Químicas, Sobrancelhas, Tratamentos, Unhas, Outros.

Valores gravados: `barba`, `cabelo`, `combo`, `massagem`, `nariz`, `orelha`, `quimica`, `sobrancelha`, `tratamento`, `unha`, `outros`. Para incluir uma categoria: acrescentar na lista e numa nova migration que recria `services_category_check`.

## Regras de validação (Zod, no servidor; o formulário avisa ao sair do campo)

| Campo | Regra |
|---|---|
| Nome | 2 a 80 caracteres. Único por unidade, sem diferenciar maiúsculas/minúsculas nem espaços nas pontas |
| Categoria | Uma da lista acima |
| Descrição | Opcional, até 300 caracteres |
| Preço | Guardado em **centavos inteiros** (sem erro de arredondamento). Aceita `45`, `45,5`, `45,50`, `1.250,00`, `R$ 45,00`. De R$ 0,00 a R$ 100.000,00. Máscara entra pela direita (`4500` vira `45,00`) |
| Duração | Uma das opções: 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180 min (o banco aceita 5 a 480) |
| Duração própria | Mesma lista; vazio = usa a padrão do serviço |

## Imagem

- Mesmo fluxo da foto do profissional (ajuste com arrastar/ampliar), mas com **recorte quadrado de cantos arredondados**, no máximo **640 px**, WebP, alvo de ~**70 KB** (`outSize` e `targetBytes` do `PhotoUploader`).
- Envio direto ao Storage (bucket `service-images`, público para leitura, limite 1 MB, webp/jpeg/png) com a sessão de quem está logado. Caminho `<unit_id>/<service_id>.<ext>`; o id do serviço nasce no formulário para o arquivo ter nome antes do cadastro.
- A recepção da própria unidade (e o admin) grava; barbeiro não. O arquivo antigo é removido ao salvar. Cancelar um cadastro depois de enviar a imagem deixa o arquivo solto no bucket (mesmo comportamento da foto do profissional).
- Sem imagem, a lista mostra o ícone da categoria.

## Profissionais x serviços

Tabela `barber_services` (`barber_id`, `service_id`, `unit_id`, `duration_minutes` opcional).

- **Mesma unidade garantida pelo banco**: chaves compostas `(barber_id, unit_id)` e `(service_id, unit_id)`; não dá para ligar itens de unidades diferentes.
- **Duração própria**: `NULL` = vale a duração padrão do serviço. Regra para a agenda: usar a do profissional se existir; senão, a do serviço.
- **Sem ninguém ligado** é permitido. O serviço continua no catálogo; na agenda ele só entra para um profissional que esteja ligado a ele.
- **Inativos**: profissional ou serviço inativo some das escolhas, mas a ligação fica guardada e volta se for reativado.
- O servidor (`src/lib/services/links.ts`) compara o marcado com o que existe e só insere, atualiza ou remove o necessário; considera apenas itens **ativos da própria unidade**.
- Se o serviço (ou profissional) for salvo e a ligação falhar, o cadastro não se perde: aparece um aviso pedindo para abrir e salvar de novo.

## Segurança (RLS)

| Quem | `services` | `barber_services` | Bucket `service-images` |
|---|---|---|---|
| admin da rede | lê e escreve em todas as unidades | idem | grava em qualquer unidade |
| recepção da unidade | lê e escreve só na própria unidade | idem (inclui editar só a duração) | grava só na pasta da própria unidade |
| barbeiro | só lê o catálogo da própria unidade | só lê | não grava |
| anônimo / sem papel | nada | nada | só lê a imagem por URL pública |

- Não há `DELETE`: o serviço é **desativado**, o que preserva o histórico da agenda.
- Privilégios por coluna: `unit_id` não muda depois de criado; na ligação só `duration_minutes` é editável.
- A unidade vem sempre do guard (`requireUnitArea`), nunca do formulário; as actions têm limite de uso e mensagens genéricas de erro.

## Arquivos principais

| Caminho | Papel |
|---|---|
| `supabase/migrations/20261014000800` a `001300` | tabela, categorias, imagem (coluna e bucket), ligação e duração própria |
| `src/lib/validation/service.ts` | categorias, duração, dinheiro e `serviceSchema` |
| `src/lib/services/{types,queries,image,links}.ts` | tipos, consultas, caminho da imagem e sincronização das ligações |
| `src/app/u/[slug]/servicos/` | páginas e `actions.ts` |
| `src/components/unit/service-*.tsx`, `barber-service-picker.tsx`, `duration-options.ts` | formulário, lista, escolha de profissionais/serviços |

## Testes

- `npm test`: validação (dinheiro, duração, categorias, schema), leitura da seleção do formulário e caminho da imagem.
- `npm run test:rls:offline` e `npm run test:rls`: serviços, ligações e imagens (isolamento entre unidades, papéis, limites do banco).
- `npm run test:e2e`: navegador real (Edge/Chrome instalado, `playwright-core`) percorrendo cadastro, validações, edição, vínculo nos dois sentidos, imagem, busca, desativar e telas no celular. Precisa do app rodando (`npm run dev`); `HEADED=1` abre a janela. Cria e apaga uma unidade temporária.

## Fora do escopo por enquanto

Preço próprio por profissional e comissão por serviço.

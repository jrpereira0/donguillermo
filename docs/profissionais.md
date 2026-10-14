# Profissionais (cadastro de barbeiros)

Área da **recepção** (e do admin da rede): `/u/<slug>/profissionais`. Cada profissional tem ficha e login próprio (e-mail + senha definidos pela recepção).

## Telas

| Rota | O que faz |
|---|---|
| `/u/<slug>/profissionais` | Lista com busca (nome, apelido, função, telefone, e-mail). Linha inteira abre a edição; botão de WhatsApp ao lado do celular; ativar/desativar |
| `/u/<slug>/profissionais/novo` | Cadastro em abas |
| `/u/<slug>/profissionais/<id>` | Edição nas mesmas abas |

### Abas do cadastro

- **Dados pessoais**: foto, nome, sobrenome, apelido na agenda, **função**, nascimento, telefone; **endereço** com busca por CEP; CNPJ e redes sociais (opcionais).
- **Acesso**: e-mail e senha (cadastro). Na edição: trocar senha e ativar/desativar.
- **Horários**: um dia por vez (faixa Seg a Dom). Quatro horários: entrada, saída para o almoço, volta e saída; o intervalo é o almoço (opcional). "Folga" por dia e atalhos para copiar para todos os dias ou de segunda a sexta.
- **Serviços**: marca os serviços que o profissional faz e ajusta a duração de cada um (padrão do serviço ou outra). Detalhes em [servicos.md](servicos.md).
- **Comissões**: percentual sobre serviços e sobre produtos.

Tudo é salvo por um único botão. A aba com erro ganha um ponto vermelho e abre sozinha.

## Regras de validação (Zod, no servidor; o formulário avisa ao sair do campo)

| Campo | Regra |
|---|---|
| Telefone | DDD (11 a 99) + fixo de 8 dígitos (começa com 2 a 5) ou celular de 9 (começa com 9). Máscara `(11) 91234-5678`. Guarda só dígitos. `+55` colado é aceito |
| CNPJ | 14 caracteres com dígitos verificadores. Aceita o **CNPJ alfanumérico** (letras nas 12 primeiras posições, vigente desde julho/2026). Máscara `00.000.000/0000-00`. Único por unidade |
| CEP | 8 dígitos; busca do endereço no servidor (ViaCEP), com limite de uso |
| E-mail | Formato válido; vira minúsculo. Recusa e-mail que já tem conta |
| Função | `barbeiro`, `recepcionista`, `gerente`, `lider` ou `auxiliar` |
| Horários | HH:MM; entrada < saída p/ almoço < volta < saída; almoço com os dois horários ou nenhum |
| Comissão | 0 a 100, até 2 casas |

> **A função é informativa.** Não muda permissões: todo profissional cadastrado por esta tela entra com o papel `barbeiro` (menu limitado e agenda própria). Papéis próprios para Gerente/Recepcionista exigem mudar o controle de acesso.

## Foto

- Ao escolher a imagem abre o ajuste: arrastar, ampliar (até 4×) e recorte redondo; "Reposicionar" reabre a imagem.
- O navegador recorta em quadrado, reduz para no máximo **400 px** e comprime em WebP (JPEG se não houver suporte), descendo a qualidade em degraus até ~**45 KB**. Ajustes em `src/lib/barbers/image.ts`.
- Envio direto ao Storage (bucket `barber-photos`, público para leitura, limite 1 MB, webp/jpeg/png) com a sessão de quem está logado. Caminho `<unit_id>/<barber_id>.<ext>`; a RLS só deixa a recepção da própria unidade gravar. O arquivo antigo é removido ao salvar.

## Segurança

- Criar o profissional exige a `service_role` (conta de acesso), por isso só o servidor insere (`provisionBarber`), depois do guard da unidade. A unidade vem do guard, nunca do formulário. Se algo falhar no meio, a conta criada é desfeita.
- `setBarberPassword` só aceita conta exclusivamente de barbeiro. Desativar tira o acesso (vínculo) mas guarda os dados.
- Dados pessoais (CNPJ, nascimento, endereço, telefone) só são lidos por admin, recepção da unidade e pelo próprio profissional (RLS). Só admin/recepção da unidade alteram, e só nas colunas liberadas.
- Limite de operações por hora, mensagens genéricas de erro e nenhuma senha em log.

## Banco

Tabela `barbers` e bucket de fotos (migrations `0300` a `0700`, ver [modelo-de-dados.md](modelo-de-dados.md)). Testes: `npm test`, `npm run test:rls:offline`, `npm run test:rls`, `npm run test:access` e `npm run test:e2e` (navegador real; ver [servicos.md](servicos.md#testes)). A foto usa o mesmo fluxo do cliente (ver [clientes.md](clientes.md)).

## Componentes reutilizáveis criados

`Switch` (interruptor), `Select` (lista de opções da marca), `Notice`/`FlashNotice` (aviso de sucesso da marca), `TabList` (abas), `PhotoUploader` e `PhotoCropper`, `HoursFields` (horário por dia) e a sidebar da unidade com a luz na borda (`.sidebar-edge`). Padrões visuais em [design-tokens.md](design-tokens.md).

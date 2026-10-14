# Documentação — Sistema Don Guillermo

Sistema multi-unidade para a rede de barbearias Don Guillermo. Este índice cresce a cada etapa.

| Documento | Conteúdo |
|---|---|
| [setup.md](setup.md) | Como instalar, configurar o `.env.local`, rodar em `localhost` e lista de scripts |
| [arquitetura.md](arquitetura.md) | Visão geral, camadas, pastas e diagramas |
| [modelo-de-dados.md](modelo-de-dados.md) | Diagrama ER, dicionário de dados, funções SQL e migrations |
| [permissoes-rls.md](permissoes-rls.md) | Matriz de permissões, Storage, política de RLS e como é testada |
| [autenticacao.md](autenticacao.md) | Login, recuperação de senha, fluxos e medidas de segurança |
| [redirecionamento-por-papel.md](redirecionamento-por-papel.md) | Para onde cada papel vai, guardas, barreiras e testes de acesso |
| [painel-admin.md](painel-admin.md) | Painel da rede: criar e gerenciar unidades e o acesso da recepção |
| [profissionais.md](profissionais.md) | Cadastro de barbeiros: telas, validações, foto, horários e segurança |
| [servicos.md](servicos.md) | Catálogo de serviços: categorias, preço, duração, imagem e quem faz cada serviço |
| [clientes.md](clientes.md) | Cadastro único da rede: busca, observações, histórico, consentimento e segurança |
| [design-tokens.md](design-tokens.md) | Identidade visual, padrões "luxe" e peças reutilizáveis da interface |
| [seguranca.md](seguranca.md) | Segredos, chaves do Supabase e princípios de segurança |
| [contribuicao.md](contribuicao.md) | Convenção de commits, scripts e fluxo de trabalho |
| [adr/](adr/) | Decisões de arquitetura (ADRs) |

## Estado das etapas

| Etapa | Descrição | Status |
|---|---|---|
| 1 | Fundação local | Concluída |
| 2 | Banco base (unidades, perfis, papéis, RLS) | Concluída (aplicada no Supabase) |
| 3 | Tela de login | Concluída (testada ao vivo) |
| 4 | Redirecionamento por papel | Concluída (41/41 testes de acesso) |
| 5 | Painel admin (unidades e acesso da recepção) | Concluída |
| 6 | Cadastro de profissionais | Concluída |
| 7 | Catálogo de serviços e vínculo com profissionais | Concluída |
| 8 | Cadastro de clientes (observações, histórico preparado) | Concluída |
| 9 | Agenda, comandas, produtos e caixa | Pendente |
| 10 | Autocadastro do cliente (página pública) e rotina LGPD | Pendente |

Testes atuais: Vitest 157, RLS offline 229, RLS no Supabase 159, acesso 41, ponta a ponta no navegador em Profissionais/Serviços (`test:e2e`) e Clientes (77, `test:e2e:clientes`). Comandos em [setup.md](setup.md).

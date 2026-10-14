# Documentação — Sistema Don Guillermo

Sistema multi-unidade para a rede de barbearias Don Guillermo. Este índice cresce a cada etapa.

| Documento | Conteúdo |
|---|---|
| [setup.md](setup.md) | Como instalar, configurar o `.env.local` e rodar em `localhost` |
| [arquitetura.md](arquitetura.md) | Visão geral, camadas e diagramas |
| [modelo-de-dados.md](modelo-de-dados.md) | Diagrama ER, dicionário de dados e funções de autorização |
| [permissoes-rls.md](permissoes-rls.md) | Matriz de permissões, política de RLS e como é testada |
| [profissionais.md](profissionais.md) | Cadastro de barbeiros: telas, validações, foto, horários e segurança |
| [autenticacao.md](autenticacao.md) | Login, recuperação de senha, fluxos e medidas de segurança |
| [redirecionamento-por-papel.md](redirecionamento-por-papel.md) | Para onde cada papel vai, guardas, barreiras e testes de acesso |
| [design-tokens.md](design-tokens.md) | Identidade visual (cores, fontes, logo) e como trocá-la |
| [seguranca.md](seguranca.md) | Segredos, chaves do Supabase e princípios de segurança |
| [contribuicao.md](contribuicao.md) | Convenção de commits, scripts e fluxo de trabalho |
| [adr/](adr/) | Decisões de arquitetura (ADRs) |

## Estado das etapas

| Etapa | Descrição | Status |
|---|---|---|
| 1 | Fundação local | Concluída |
| 2 | Banco base (unidades, perfis, papéis, RLS) | Concluída (aplicada no Supabase; 30/30 testes de RLS) |
| 3 | Tela de login | Concluída (testada ao vivo) |
| 4 | Redirecionamento por papel | Concluída (41/41 testes de acesso; 16 unitários) |
| 5 | Painel admin | Pendente |

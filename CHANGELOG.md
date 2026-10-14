# Histórico de alterações

Alterações relevantes do MCP Sarah, organizadas por versão e data, seguindo as convenções de [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## Convenção de manutenção

- Registrar cada mudança concluída na data em que foi realizada, no formato `AAAA-MM-DD` (ISO 8601).
- Usar as categorias **Adicionado**, **Alterado**, **Corrigido**, **Removido**, **Descontinuado** e **Segurança**, apenas quando aplicáveis.
- Descrever o impacto para quem usa o MCP; este histórico não é uma cópia do log de commits.
- Usar versões no formato `MAJOR.MINOR.PATCH`: `PATCH` para correções compatíveis, `MINOR` para funcionalidades compatíveis e `MAJOR` para mudanças incompatíveis após a versão 1.0.0.
- Durante a fase `0.x`, o contrato ainda pode mudar: incrementar `MINOR` para funcionalidades ou alterações incompatíveis e `PATCH` para correções compatíveis; documentar incompatibilidades explicitamente.
- Registrar novas alterações em **Não lançado** até fechar uma versão. No fechamento, criar a seção `## [X.Y.Z] - AAAA-MM-DD`, mantendo as datas individuais quando relevantes.
- Manter a versão sincronizada em [package.json](package.json), [package-lock.json](package-lock.json), identificação/status MCP em [src/server.ts](src/server.ts) e log de inicialização em [src/index.ts](src/index.ts).
- Usar a data real de fechamento/publicação de cada nova versão e não criar versões retroativas sem evidências. Uma consolidação local não implica publicação, tag Git ou distribuição.

O histórico inicial foi consolidado em **2026-10-02** a partir das [especificações concluídas](.specs/changes/) e conferido com o histórico Git disponível. A versão **0.1.0** já está definida no pacote e na identificação do MCP; a data de sua seção representa esta consolidação local, não um lançamento comprovado. As datas individuais correspondem ao registro das mudanças nas especificações, não necessariamente a commits ou publicações. As alterações funcionais de 2026-10-02 estavam no workspace e ainda não haviam sido commitadas nesta consolidação.

## Não lançado

### Corrigido

- (2026-10-14) Corrigida a descoberta de funções Oracle: o catálogo identifica funções pela posição de retorno em `ALL_ARGUMENTS` e associa corretamente argumentos e sobrecargas por `SUBPROGRAM_ID`, sem incluir procedures.

### Adicionado

- Integração Oracle com perfis DEV/HOM/PRO, consultas `SELECT` parametrizadas, metadados de tabelas e funções de packages; allowlist por ambiente é opcional e vazia permite funções compatíveis; aliases TNS usam diretório configurável; não há ferramentas de escrita.
- Modo Thick opcional para conexões Oracle cuja autenticação não é aceita pelo modo Thin, usando Oracle Instant Client configurado localmente.

## [0.1.0] - 2026-10-02

Consolidação local da versão atual, abrangendo as alterações documentadas desde 2026-09-24. Não foram atribuídas versões diferentes aos registros anteriores, pois o histórico disponível não comprova esses lançamentos.

### 2026-10-02

#### Adicionado

- Orientações MCP para criação e edição de Bugs no TFS: descoberta de prefixos existentes, áreas, iterações e Feature pai; proposta estruturada e aprovação conversacional, inclusive no modo sem `CONFIRMO` literal.
- Referencial de esforço com 27 combinações e cálculo de Effort quando as dimensões necessárias do Bug estão disponíveis, incluindo edições parciais.
- Histórico de alterações datado e versionado, acessível pelo README, com convenção SemVer e atualização no fechamento das mudanças.

#### Alterado

- Bugs novos exigem Feature pai, área e iteração; Activity aceita os valores autorizados e usa Development como padrão na criação de Bug.
- Orientação de Bug sugere somente uma Task Testing opcional, com prefixo `Testes -`; Tasks filhas de Bug também podem herdar responsável, área e iteração conhecidos do pai, com proteção por revisão.
- Description/Steps to Reproduce e Acceptance Criteria recebem orientação de HTML simples, com parágrafos, destaques e listas, sem template rígido. O servidor preserva o conteúdo enviado, sem converter Markdown ou quebras de linha automaticamente.

#### Corrigido

- Bloqueada a remoção explícita do pai de Bug durante edição, preservando relações legadas em alterações não relacionadas.
- Corrigido o nome do histórico para CHANGELOG.md, com atualização dos links e referências internas.

### 2026-09-30

#### Adicionado

- Consulta de menus clássicos e itens de menu do WordPress, com sugestão de posição por wiki e sistema.
- Preparação e aplicação de inclusão ou edição de itens de menu, com política `allowedMenuIds` por wiki e verificação de conflitos por snapshot.

#### Alterado

- O fluxo de documentação orienta associar a página publicada ao menu em uma segunda operação, separada da criação da página, e informar quando a associação não ocorrer.

### 2026-09-29

#### Adicionado

- Leitura e escrita de Acceptance Criteria no TFS, incluindo retorno nas consultas paginadas.
- Aliases autorizados para Priority, Effort, Business Value e os seis campos Planning configurados no perfil Sarah; campos enumerados aceitam os códigos ou rótulos definidos pela política.
- Campos Activity, Remaining Work e Blocked para Tasks, respeitando o escopo de cada tipo.
- Orientação para quatro Tasks filhas de PBI, quando aplicável: Desenvolvimento, Documentação, Comunicação e Testes, com título em português e Activity MCP em inglês.

#### Alterado

- A história de usuário na descrição padrão de PBI é orientada entre aspas e em itálico, com “Como”, “quero” e “para” também em negrito; não há transformação automática do HTML recebido.
- Tasks filhas de PBI passam a herdar responsável, área e iteração do pai quando esses valores não são informados. O diff apresenta os defaults, e mudanças na revisão do pai bloqueiam a aplicação; edições não herdam automaticamente.

### 2026-09-24

#### Adicionado

- Plataforma MCP local em Node.js/TypeScript, transporte `stdio`, módulos independentes e resultados estruturados e paginados.
- Integração TFS/Azure DevOps Server REST 7.0: consultas seguras de work items, queries salvas, classificações, detalhes e preparação de criação, edição e remoção recuperável.
- Consulta, criação, edição e deleção de comentários de work items TFS, com API própria de comentários e verificação de versão nas alterações e deleções.
- Integração WordPress REST para consulta e manutenção de páginas, posts e mídias, incluindo upload validado e remoção recuperável quando suportada.
- Perfis WordPress `user` e `developer`, com escolha explícita de wiki quando ambos estão configurados e compatibilidade com `WP_BASE_URL` para uma única wiki.
- Painel local aberto por `npm run dev`, com status das integrações, orientação e testes somente de leitura.
- Modo opcional `MCP_REQUIRE_CONFIRMATION=false`, que dispensa apenas a confirmação literal `CONFIRMO`.
- Testes simulados, cobertura, build, documentação operacional e fluxo de especificações para desenvolvimento assistido por IA.

#### Alterado

- Módulos implementados são registrados automaticamente, sem seletor global; a ausência de configuração de uma integração não impede o uso das demais.
- Allowlists WordPress vazias representam escopo irrestrito; listas preenchidas continuam restritivas. Raízes locais de mídia vazias permitem caminhos legíveis pelo processo, mantendo as validações de arquivo.

#### Segurança

- Escritas em duas fases: preparação com diff e token de uso único, seguida de aplicação com preflight; planos expiram e são invalidados ao reiniciar o servidor.
- Proteção contra conflitos por revisão, data de modificação ou hash, conforme a operação; nenhuma ferramenta oferece destruição permanente.
- Token e preflight permanecem obrigatórios no modo sem confirmação literal.
- Logs em `stderr`, auditoria opcional e redação de segredos; `stdout` fica reservado ao protocolo MCP.

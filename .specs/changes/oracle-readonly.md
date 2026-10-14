---
id: oracle-readonly
status: concluded
created: 2026-10-14
updated: 2026-10-14
---

# Consultas Oracle somente leitura

## Objetivo

Adicionar ao MCP Sarah uma integração Oracle que permita consultar registros, estrutura/parametrização de tabelas e metadados/resultado de funções de packages.

## Escopo

- Perfis independentes Oracle DEV, HOM e PRO, selecionando DEV por padrão.
- Variáveis de ambiente por perfil para connect string, usuário e senha; aceitar usuário alternativo por chamada sem alterar a senha do perfil.
- Suporte a alias TNS em Thin mode com diretório `tnsnames.ora` configurável por perfil.
- Modo Thick opcional com Oracle Instant Client 19+ para autenticação legada incompatível com Thin mode.
- Consultas SQL `SELECT` com binds e limite de linhas.
- Leitura de colunas e parâmetros de tabela, metadados de funções e execução de função escalar com argumentos IN.
- Rejeitar qualquer API de escrita; não incluir mutações Oracle.
- Usar transação Oracle READ ONLY em cada chamada, fechar conexão e não repetir chamadas automaticamente.
- Atualizar README, catálogo, configuração, segurança, arquitetura e CHANGELOG.

## Fora de escopo

- DML/DDL, blocos PL/SQL, procedures e execução de funções com parâmetros OUT/IN OUT ou tipos compostos.
- Testes com banco ou credenciais reais nesta mudança.

## Critérios de aceite

- [x] Integração aparece no status mesmo sem configuração e não impede módulos existentes.
- [x] DEV é padrão explícito; HOM/PRO só são selecionados quando pedidos.
- [x] Alias TNS localiza `tnsnames.ora` por `ORACLE_TNS_ADMIN_<AMBIENTE>`.
- [x] Modo Thick opcional inicializa o Instant Client e usa diretório TNS compartilhado.
- [x] Operações Oracle MCP são apenas leitura, com schemas validados, binds para valores, transação READ ONLY e allowlist opcional; lista vazia permite funções compatíveis, lista preenchida restringe.
- [x] Usuário alternativo usa a senha do perfil escolhido e não é armazenado/logado.
- [x] Testes simulados cobrem configuração, ferramentas, proteção somente leitura e semântica de allowlist vazia/definida.
- [x] Documentação de configuração, uso, limitações de segurança e variáveis `.env.example` atualizada.
- [x] Typecheck, lint, suíte, cobertura, build e validação do workflow aprovados.

## Riscos

- `SELECT` pode invocar funções com efeitos colaterais; transação READ ONLY bloqueia DML normal, mas funções autônomas ou efeitos externos exigem controle por permissões e confiança nos packages concedidos.
- A conta Oracle deve seguir menor privilégio: leitura de objetos e execução apenas de packages aprovados.
- Consultas a ALL_* retornam somente metadados visíveis ao usuário efetivo.
- Allowlist vazia habilita todas as funções escalares compatíveis que o usuário consegue executar; o risco de efeitos colaterais aumenta e depende das permissões Oracle e avaliação do DBA.
- Em node-oracledb Thin mode, aliases TNS não descobrem automaticamente `tnsnames.ora`; é necessário fornecer o diretório via `configDir`.

## Evidências

- Dependência `oracledb` e tipos instalados; conexão Thin mode por padrão ou Thick mode opcional, com timeout, rollback/close e sem retry.
- Testes de cliente cobrem seleção de DEV, usuário alternativo com senha do perfil, transação READ ONLY, binds, SELECT, metadados de tabela, funções escalares, bloqueio OUT e allowlist.
- `npm run typecheck`, `npm run lint`, `npm test` (15 arquivos, 111 testes), `npm run test:coverage`, `npm run build`, `npm run validate:workflow` e `git -c core.safecrlf=false diff --check`: aprovados em 2026-10-14.
- Cobertura total da suíte: 76,37% de linhas. `npm audit --omit=dev`: zero vulnerabilidades em dependências de produção.
- Nenhuma conexão a banco real foi tentada; credenciais Oracle não foram consultadas ou registradas.
- Pedidos de alteração são orientados, nunca executados. Funções de package podem ser restringidas por allowlist exata `OWNER.PACKAGE.FUNCTION` por ambiente; lista vazia é irrestrita.
- Alteração solicitada em 2026-10-14: allowlist vazia deixa de negar chamadas e passa a permitir todas as funções compatíveis acessíveis à credencial; allowlist preenchida permanece restritiva. Testes focados aprovados (3 arquivos, 25 testes).
- Validação após a alteração: `npm run typecheck`, `npm run lint`, `npm test` (15 arquivos, 110 testes), `npm run test:coverage` (76,37% linhas), `npm run build`, `npm run validate:workflow` e `git -c core.safecrlf=false diff --check`: aprovados em 2026-10-14.
- O teste do painel foi isolado dos perfis Oracle do `.env` local; nenhum banco real foi acessado.
- Diagnóstico TNS: o cliente passa `ORACLE_TNS_ADMIN_<AMBIENTE>` como `configDir` para resolver aliases em Thin mode; teste simulado aprovado.
- Teste ao vivo autorizado em 2026-10-14: conexão Thin falhou com `NJS-116`; Instant Client 19c local conectou em Thick mode e `SELECT 1 FROM DUAL` retornou uma linha. Nenhum dado da tabela foi exposto nesse diagnóstico.
- Servidor MCP compilado e iniciado por `stdio`; `oracle_query` em DEV com bind retornou contagem 1 para o registro informado, sem expor colunas clínicas. Configuração local ativou `ORACLE_CLIENT_LIB_DIR`; `ORACLE_CONNECT_STRING_DEV` permaneceu com o alias TNS informado.
- Após a correção: typecheck, lint, 113 testes em 15 arquivos, cobertura (76,66% linhas), build e validação do workflow aprovados.
- Correção de `oracle_list_package_functions`: `ALL_PROCEDURES.PROCEDURE_TYPE` não é uma coluna válida nesse catálogo; funções passam a ser identificadas pela linha de retorno `ALL_ARGUMENTS.POSITION = 0`, e argumentos são associados pelo owner, package e `SUBPROGRAM_ID`. O mesmo critério de retorno é usado na seleção anterior à chamada de função.
- Regressão com catálogo simulado cobre procedure sem retorno, função e função sobrecarregada; teste focado passou (11 testes). Typecheck, lint, suíte com cobertura (114 testes; 77,66% de linhas), build, validação do workflow e diff-check também passaram em 2026-10-14.
- Consulta somente de metadados em DEV para `SIH.EPSOLICITACAOINTERNACAO` passou em transação READ ONLY e retornou 87 funções, incluindo sobrecarga de `OBTERINTERNACAO`; todos os resultados continham metadados de retorno. Nenhuma função foi executada; HOM/PRO não foram consultados.

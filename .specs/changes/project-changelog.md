---
id: project-changelog
status: concluded
created: 2026-10-02
updated: 2026-10-02
---

# Histórico de alterações

## Objetivo

Criar CHANGELOG.md na raiz com as alterações realizadas no MCP, suas datas e versões, conforme solicitado.

## Escopo

- Consolidar mudanças concluídas das especificações em ordem cronológica inversa.
- Adotar datas ISO 8601, categorias e descrições orientadas ao usuário, inspiradas em Keep a Changelog.
- Distinguir datas de registro/implementação de datas de publicação e não inventar versões.
- Consolidar o histórico na versão 0.1.0 existente e definir SemVer e seção Não lançado, sem atribuir versões retroativas sem evidências.
- Corrigir o nome do histórico e referências para CHANGELOG.md.
- Vincular o histórico no README e registrar a atualização como parte do fechamento de mudanças.

## Fora de escopo

- Alterar código, publicar versões, executar serviços reais ou fazer commit/push.
- Reescrever alterações locais anteriores a esta tarefa.

## Critérios de aceite

- [x] Arquivo solicitado existe, com datas verificáveis e principais alterações de TFS, WordPress e núcleo.
- [x] Convenção de manutenção e fontes documentadas, sem versões ou datas de lançamento presumidas.
- [x] README aponta para o histórico e o fluxo orienta sua manutenção.
- [x] Workflow, links locais e diff validados.
- [x] Nome convencional e referências consistentes, sem a grafia anterior.
- [x] Versionamento documentado e alinhado com pacote, lockfile e identificação MCP.

## Riscos

- O histórico foi reconstruído de specs concluídas; suas datas não comprovam lançamento nem commit.
- Mudanças funcionais de 2026-10-02 já existem no workspace, mas ainda não estão commitadas.

## Evidências

- Consultadas as 13 specs funcionais concluídas e o histórico Git somente para leitura.
- Criado CHANGELOG.md com registros de 2026-09-24, 2026-09-29, 2026-09-30 e 2026-10-02, por impacto e categoria; nome corrigido após esclarecimento do usuário em 2026-10-02, incluindo links e nome da spec.
- Extensão de escopo solicitada: versionamento SemVer e consolidação em 0.1.0, já declarada no pacote e MCP. Data de consolidação explicitamente distinta de publicação.
- Validação complementar em 2026-10-02: versão 0.1.0 consistente entre histórico, pacote, ambas as entradas raiz do lockfile e identificação/log MCP; links locais, datas ISO e ordenação aprovados. Busca pela grafia anterior sem resultados e diagnósticos dos seis documentos sem erros.
- A primeira leitura do lockfile com ConvertFrom-Json falhou pela chave vazia de packages; validação repetida com -AsHashtable e aprovada, sem alteração no lockfile.
- `npm run validate:workflow`, `git -c core.safecrlf=false diff --check` e verificação dos links locais do histórico, README e fluxo: aprovados em 2026-10-02.
- Datas ISO 8601 e ordem cronológica inversa verificadas; diagnósticos do editor sem erros nos documentos consultados.
- Alteração somente documental; nenhuma chamada remota, alteração de runtime, commit ou push. Alterações locais anteriores preservadas.
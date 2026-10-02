---
id: tfs-bug-guidance
status: concluded
created: 2026-10-02
updated: 2026-10-02
---

# Orientações de Bugs no TFS

## Objetivo

Preparar Bugs claros, sem informações inventadas, com padrão real de sistema, estimativas fundamentadas, localização e pai verificados e aprovação da proposta antes da escrita.

## Escopo aprovado

- Pesquisar títulos existentes para preservar prefixos como `[TRIAGEM INT. E CIR.]`; propor novo prefixo apenas se não houver padrão identificável.
- Descobrir áreas, iterações e pai por ferramentas de leitura; respeitar Epic → Feature → PBI/Bug → Task.
- Activity Development por padrão em Bug; sugerir apenas Task Testing, com prefixo Testes - e herança do pai.
- Documentar a matriz de 27 combinações do anexo, disponibilizá-la ao agente via MCP e calcular Effort quando as três dimensões do Bug estiverem disponíveis.
- Proposta estruturada e aprovação conversacional em criação/edição de Bug, inclusive no modo sem CONFIRMO literal; edição parcial sem normalização indiscriminada.

## Fora de escopo

- Escritas em serviços reais, alteração do Bug do print e migração de hierarquias existentes.
- Inferir causas, horas, responsáveis, estados ou referência técnica de campos não confirmados.
- Transformar aprovação conversacional em garantia técnica do servidor ou mudar globalmente o modo de confirmação.

## Critérios de aceite

- [x] Instruções MCP ensinam descoberta de prefixo, classificações reais e pai compatível, com tratamento de ambiguidades.
- [x] Criação/edição de Bug apresentam proposta e aguardam aprovação; Task Testing opcional e não duplicada.
- [x] Activity é permitido em Bug/Task; demais campos Task preservam seu escopo; Bug só admite Feature como pai.
- [x] Matriz completa de esforço está documentada e testada; edição preserva campos não solicitados.
- [x] Tasks de Bug herdam valores conhecidos do pai e bloqueiam conflito de revisão.
- [x] Typecheck, lint, suíte, cobertura, build e workflow aprovados, sem escrita remota.

## Riscos

- O print comprova Activity no Bug, mas a disponibilidade/gravação dos reference names depende do processo remoto.
- Busca de títulos usa CONTAINS sobre System.Title; não garante encontrar todos os padrões. Ausência de resultados deve ser declarada, sem fabricar precedente.
- Área/iteração do pai são candidatos, não prova de localização correta; ambiguidades precisam de decisão do usuário.
- Aprovação conversacional é orientação ao agente; token/preflight e aprovação do host continuam independentes.
- Bug e Task são duas operações não atômicas; a Task só recebe parentId depois de a criação do Bug retornar ID real.

## Evidências

- Pesquisa somente leitura confirmou ausência de matriz de esforço existente e aliases Planning já configurados.
- Plano aprovado pelo usuário, incluindo pesquisa do prefixo real e descoberta de área, iteração e pai.
- `npm run typecheck`, `npm run lint`, `npm test` (14 arquivos, 99 testes), `npm run test:coverage` (76,68% linhas; 100% linhas da matriz/orientação de Bug), `npm run build` e `npm run validate:workflow`: aprovados em 2026-10-02. `git diff --check` sem erros; avisos de conversão LF/CRLF do Git não indicam falha.
- Testes da matriz usam transcrição independente das 27 combinações e verificam também o referencial Markdown. Contratos MCP simulam descoberta de prefixo, árvores, Feature/Epic, criação com defaults, edição parcial, preservação de pai legado, rejeição de remoção explícita de pai, herança/overrides da Task e conflito de revisão.
- Revisão somente leitura identificou a possibilidade de desvincular Bug em edição; bloqueio de parentId null e regressão incluídos. Nenhuma credencial lida, serviço real consultado ou escrita remota feita; nenhum commit/push.
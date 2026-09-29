---
id: tfs-task-parent-defaults
status: concluded
created: 2026-09-29
updated: 2026-09-29
---

# Título e defaults de Tasks filhas de PBI

## Objetivo

Corrigir a orientação do título de Tasks e garantir que novas Tasks filhas de PBI herdem responsável, área e iteração quando não forem explicitamente informados.

## Escopo

- Instruir o agente a encurtar o próprio título do PBI por remoção de palavras, sem inserir preposições nem reescrever o conteúdo, mantendo o sufixo igual ou mais curto que o título original.
- Sugerir descrição breve do trabalho específico da Task quando houver informação verificável no PBI, sem inventar detalhes e sem forçar descrição genérica.
- Na preparação de criação de Task filha de PBI, preencher `assignedTo`, `areaPath` e `iterationPath` ausentes com valores existentes do pai; respeitar valores explícitos, inclusive `null`.
- Incluir os defaults no diff e bloquear aplicação se a revisão do PBI mudar entre preparação e escrita.
- Cobrir herança, sobrescrita, ausência de valores e conflito com contratos MCP simulados.

## Fora de escopo

- Modificar Tasks existentes em lote ou alterar dados TFS reais nesta mudança.
- Criar descrição artificial sem evidência no PBI; impor formatação de título a pedidos explicitamente diferentes.
- Alterar a política de tipos de pai ou a regra de remoção recuperável.

## Critérios de aceite

- [x] Descrição da ferramenta orienta títulos concisos usando somente palavras do título do PBI, sem preposições novas.
- [x] `assignedTo`, `areaPath`, `iterationPath` são herdados quando ausentes e constam no diff e no POST da Task.
- [x] Valores explícitos, inclusive `null`, não são sobrescritos; campos ausentes no pai não são inventados.
- [x] Revisão alterada do PBI bloqueia aplicar plano com defaults herdados sem POST.
- [x] Ferramenta orienta descrições resumidas apenas quando houver contexto suficiente.
- [x] Validação de contratos MCP, testes, cobertura, lint, types, build e workflow passa.

## Riscos

- Identidades do TFS podem ser retornadas como objetos; usar o identificador `uniqueName` quando disponível para evitar ambiguidade entre usuários homônimos.
- A ausência de `System.AssignedTo` no pai implica deixar o campo sem preenchimento, não atribuir ao autor da operação.
- O preflight reduz conflitos, mas não cria transação entre a leitura do pai e o POST da Task.

## Evidências

- Relato de teste do usuário: preposições adicionadas ao sufixo do título e defaults de responsável/área/iteração não propagados.
- Contratos simulados MCP cobrem descrição/schema da ferramenta, campos herdados no diff/POST, identidade `uniqueName`, valores explícitos e conflito do pai antes de escrever.
- `npm run typecheck`, `npm run lint`, `npm test` (11 arquivos, 56 testes), `npm run test:coverage` (71,39% de linhas), `npm run build` e `npm run validate:workflow`: aprovados.
- `git diff --check`: aprovado; avisos LF/CRLF são do Git no Windows, sem erro de whitespace.
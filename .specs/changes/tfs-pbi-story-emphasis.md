---
id: tfs-pbi-story-emphasis
status: concluded
created: 2026-09-29
updated: 2026-09-29
---

# Destaque de palavras-chave na história do PBI

## Objetivo

Facilitar a leitura da história de usuário no início da descrição de novos PBIs.

## Escopo

- Orientar o agente a manter a frase inteira entre aspas e em itálico, com `Como`, `quero` e `para` também em negrito por HTML.
- Manter a descrição detalhada após a história e respeitar formatação explicitamente solicitada pelo usuário.
- Atualizar exemplo e testes de contrato MCP e do cliente TFS, sem escrita em serviço real.

## Fora de escopo

- Reescrever automaticamente descrições fornecidas ou editar PBIs existentes em lote.
- Alterar os demais campos ou contratos de Task.

## Critérios de aceite

- [x] Orientação publicada em criação e edição contém exemplo HTML com aspas, itálico e três marcadores em negrito.
- [x] Descrição detalhada continua após a história; formato explícito prevalece.
- [x] Testes e validações proporcionais passam.

## Riscos

- As ferramentas instruem o agente, não formatam automaticamente conteúdo enviado; HTML existente permanece intacto.

## Evidências

- Pedido do usuário em 2026-09-29 para enfatizar `Como`, `quero` e `para`.
- `npm run typecheck`, `npm run lint`, `npm test` (11 arquivos, 56 testes), `npm run test:coverage` (71,39% de linhas), `npm run build` e `npm run validate:workflow`: aprovados.
- Testes simulados verificam a orientação HTML no catálogo e no schema MCP e a descrição enviada no JSON Patch do PBI.
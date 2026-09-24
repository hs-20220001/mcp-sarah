---
id: optional-confirmation-mode
status: concluded
owner: local
created: 2026-09-24
updated: 2026-09-24
---

# Modo sem confirmação humana

## Objetivo

Permitir um modo local e opt-in em que o agente aplique planos sem pedir a resposta literal `CONFIRMO` ao usuário.

## Escopo

- Adicionar `MCP_REQUIRE_CONFIRMATION`, com padrão `true`.
- Quando o valor for `false`, manter preparação, diff, token, preflight, auditoria e escrita única.
- Tornar o campo literal `CONFIRMO` opcional somente no schema de `operations_apply` desse modo.
- Informar o modo nas instruções do servidor e nas mensagens das ferramentas de preparação.
- Documentar o risco e atualizar testes de configuração e contrato MCP.

## Riscos

- Com `MCP_REQUIRE_CONFIRMATION=false`, qualquer plano preparado pode ser aplicado sem uma pausa para revisão humana.
- A aprovação do host MCP continua sendo uma configuração separada e pode solicitar autorização para ferramentas de escrita.

## Critérios de aceite

- [x] O padrão exige confirmação.
- [x] `MCP_REQUIRE_CONFIRMATION=false` permite aplicar sem o campo `CONFIRMO`.
- [x] O token do plano e o preflight continuam obrigatórios.
- [x] Configuração, documentação e mensagens explicam o modo confiável.
- [x] Typecheck, lint, testes, build e validação do workflow passam.

## Evidências

- `npm run typecheck` e `npm run lint`: aprovados.
- `npm test`: 11 arquivos e 43 testes aprovados.
- `npm run build`: aprovado.
- `npm run validate:workflow`: aprovado após o fechamento.
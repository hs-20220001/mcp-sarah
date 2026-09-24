---
id: always-enable-developed-modules
status: concluded
owner: local
created: 2026-09-24
updated: 2026-09-24
---

# Habilitar automaticamente todos os módulos desenvolvidos

## Objetivo

Remover o seletor global de módulos e registrar automaticamente todas as integrações presentes no servidor.

## Escopo

- Remover o seletor da configuração, exemplos, smoke test e documentação.
- Registrar TFS e WordPress sempre.
- Manter validação e falhas de configuração isoladas por módulo.
- Atualizar os testes MCP e de configuração.

## Critérios de aceite

- [x] Não existe variável de ambiente ou configuração para habilitar/desabilitar módulos.
- [x] As 23 ferramentas são publicadas mesmo quando faltam credenciais.
- [x] Módulos sem configuração informam `configured: false` sem impedir os demais.
- [x] Typecheck, lint, testes, build e workflow passam.

## Evidências

- A variável foi removida do núcleo, `.env.example`, `.env` local, exemplo do Codex, testes e documentação.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:coverage` e `npm run build`: aprovados.
- `npm test`: 10 arquivos e 32 testes aprovados.
- `npm run test:live` com opt-in explícito: dois módulos alcançáveis.
- `npm run validate:workflow`: aprovado.

---
name: mcp-development
description: Evoluir o núcleo, os módulos, schemas, ferramentas e contratos MCP Sarah. Usar ao criar uma integração, registrar ferramentas, alterar resultados estruturados, transportes, operações confirmáveis, erros, logging ou testes MCP.
---

# Desenvolvimento MCP

1. Leia `docs/architecture.md`, `docs/tools.md` e `docs/security.md`.
2. Mantenha `createServer()` independente do transporte e isole cada integração atrás de `IntegrationModule`.
3. Valide entradas com Zod antes de qualquer chamada de rede.
4. Encaminhe toda mutação por `OperationService`; um plano representa exatamente uma escrita remota.
5. Escreva logs somente em `stderr` e nunca inclua credenciais ou corpos sensíveis.
6. Forneça texto curto, `structuredContent`, identificador estável e URL quando houver.
7. Atualize contratos simulados e o teste MCP em memória antes de concluir.

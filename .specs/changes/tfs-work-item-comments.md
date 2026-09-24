---
id: tfs-work-item-comments
status: concluded
owner: local
created: 2026-09-24
updated: 2026-09-24
---

# Comentários de work items TFS

## Objetivo

Permitir consultar, inserir, alterar e deletar comentários de work items do Azure DevOps Server pelo MCP Sarah.

## Escopo

- Usar a API de comentários `7.0-preview.3` do TFS Server.
- Expor leitura de comentários e planos confirmáveis para criar, alterar e deletar um comentário.
- Verificar a versão do comentário imediatamente antes de alterar ou deletar.
- Manter a confirmação explícita, sem retry de escritas e sem expor credenciais ou conteúdo em logs.
- Atualizar o contrato MCP, a documentação TFS e os testes simulados.

## Riscos

- Deletar comentário é uma mutação destrutiva no recurso de comentários e exige confirmação explícita.
- A API de comentários usa uma versão preview independente da versão geral configurada para work items.
- Um comentário pode mudar entre a preparação e a aplicação; o preflight precisa bloquear esse conflito.

## Critérios de aceite

- [x] É possível listar comentários de um work item.
- [x] É possível preparar e aplicar a criação de um comentário.
- [x] É possível preparar e aplicar a alteração de um comentário com verificação de versão.
- [x] É possível preparar e aplicar a deleção de um comentário com verificação de versão.
- [x] Testes simulados cobrem URLs, métodos, corpos, versão preview e concorrência.
- [x] Typecheck, lint, testes, build e validação do workflow passam.

## Evidências

- `npm run typecheck` e `npm run lint`: aprovados.
- `npm test`: 11 arquivos e 41 testes aprovados.
- `npm run test:coverage`: aprovado.
- `npm run build`: aprovado.
- `npm run validate:workflow`: aprovado antes do fechamento; será repetido após marcar a mudança como concluída.
- `npm run dev` iniciou o painel local em `http://127.0.0.1:3333`.
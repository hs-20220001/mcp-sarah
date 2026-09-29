---
id: tfs-pbi-fields
status: concluded
created: 2026-09-29
updated: 2026-09-29
---

# Campos de Product Backlog Item no TFS

## Objetivo

Melhorar a criação, edição, leitura e listagem de Product Backlog Items (PBI) pelo MCP, incluindo os campos de aceite e planning usados pelo projeto.

## Escopo

- Orientar as ferramentas MCP de criação e edição para, por padrão, iniciar a descrição do PBI com uma frase de história do usuário entre aspas e em itálico, seguida dos detalhes; preservar o formato pedido explicitamente pelo usuário.
- Expor Acceptance Criteria como campo de primeira classe para leitura e escrita em criação/edição e em resultados paginados.
- Expor em listagens os aliases de campos customizados disponíveis, adicionar `priority` e validar os valores declarados pela política.
- Documentar a matriz dos campos visíveis no exemplo e campos sem mapeamento verificável.
- Cobrir o contrato com testes unitários e MCP simulados; não acessar nem escrever em TFS real.

## Fora de escopo

- Alterar automaticamente a descrição recebida ou inventar conteúdo de história sem contexto suficiente.
- Inventar reference names para `Personas affected` ou `Mapped on SpecMap`.
- Validar a disponibilidade de campos consultando um TFS remoto.

## Critérios de aceite

- [x] As ferramentas MCP descrevem o padrão de formatação da descrição de PBI em criação e edição sem aplicá-lo a outros tipos.
- [x] Acceptance Criteria é normalizado em leitura e pode ser preparado para escrita.
- [x] A listagem paginada retorna Acceptance Criteria e valores de `customFields` permitidos.
- [x] Prioridade e seis campos de Planning são mapeados com os rótulos e valores permitidos declarados na política.
- [x] Campos sem reference name conhecido são identificados na documentação, sem escrita especulativa.
- [x] Typecheck, lint, testes, cobertura, build e validação de workflow passam.

## Riscos

- A presença, obrigatoriedade, permissões e valores aceitos pelos campos dependem do processo configurado no Azure DevOps real; a política local não confirma o esquema remoto.
- Referências de `Personas affected` e `Mapped on SpecMap` não podem ser inferidas com segurança apenas pelo rótulo da interface.
- Description e Acceptance Criteria são campos HTML no TFS; a orientação de formatação não altera automaticamente conteúdo de entrada.

## Evidências

- Auditoria estática da política, módulo, cliente e testes existente; sem conexão com TFS real.
- `npm run typecheck`, `npm run lint`, `npm test` (11 arquivos, 49 testes), `npm run test:coverage` (64,66% linhas), `npm run build` e `npm run validate:workflow`: aprovados.
- `git diff --check`: aprovado; as mensagens exibidas foram avisos do Git sobre conversão LF/CRLF no Windows.
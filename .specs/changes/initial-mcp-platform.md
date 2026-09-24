---
id: initial-mcp-platform
status: concluded
owner: local
created: 2026-09-24
updated: 2026-09-24
---

# Plataforma MCP local Sarah — fase inicial

## Objetivo

Entregar um servidor MCP independente, extensível e executável por `stdio`, com consultas e mutações confirmáveis para TFS/Azure DevOps Server 2022 e WordPress.

## Escopo

- Núcleo MCP independente do transporte e módulos registrados estaticamente.
- Configuração modular, erros estáveis, logs redigidos, snapshots e operações confirmáveis.
- Ferramentas TFS e WordPress descritas em `docs/tools.md`.
- Políticas versionadas e bloqueio seguro quando uma allowlist não existe.
- Documentação, skills locais, testes unitários, contratos simulados e teste MCP em memória.

## Fora de escopo

- HTTP transport, OAuth do MCP, interface visual e integrações adicionais.
- Exclusão permanente ou restauração de lixeira.
- Escritas ao vivo fora de sandbox.

## Critérios de aceite

- [x] TFS e WordPress podem ser habilitados separadamente.
- [x] Toda mutação gera um plano de uma escrita remota e exige token + `CONFIRMO`.
- [x] Conflitos usam revisão TFS, `modified_gmt` ou SHA-256 do arquivo.
- [x] Nenhum endpoint solicita destruição permanente.
- [x] Leituras, normalização, paginação e contratos de escrita possuem cobertura simulada.
- [x] Cliente MCP em memória lista e executa ferramentas.
- [x] `typecheck`, `lint`, `test`, `test:coverage`, `build` e `validate:workflow` passam juntos.
- [x] Documentação e skills locais estão validadas.

## Riscos

- Processos TFS customizados podem divergir dos aliases atuais.
- Plugins WordPress podem alterar permissões e suporte à lixeira de mídia.
- Resposta de rede ambígua em escrita exige verificação manual; não há retry automático.

## Evidências

- `npm run typecheck`: aprovado em 2026-09-24.
- `npm run lint`: aprovado em 2026-09-24.
- `npm test`: 10 arquivos e 32 testes aprovados em 2026-09-24.
- `npm run test:coverage`: aprovado; relatório gerado localmente e ignorado pelo Git.
- `npm run build`: aprovado com entrada em `dist/index.js`.
- `npm run validate:workflow`: aprovado.
- Smoke MCP contra o processo compilado via `stdio`: aprovado, com as quatro ferramentas centrais.
- As quatro skills locais passaram no `quick_validate.py` da skill `skill-creator`.
- Smoke ao vivo de TFS/WordPress não executado: permanece opt-in e depende de credenciais reais.

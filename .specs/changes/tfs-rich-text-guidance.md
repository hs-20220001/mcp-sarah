---
id: tfs-rich-text-guidance
status: concluded
created: 2026-10-02
updated: 2026-10-02
---

# Formatação de texto rico no TFS

## Objetivo

Evitar texto visualmente concatenado em Description/Steps to Reproduce e Acceptance Criteria, conforme os prints apresentados, preservando liberdade de organização e conteúdo aprovado.

## Escopo

- Instruções de criação/edição e schemas dos campos orientam HTML simples, parágrafos, destaques e listas sem impor seções fixas.
- Diferenciar Markdown de apresentação no chat de HTML efetivamente enviado ao TFS; quebras de linha simples não garantem separação visual.
- Testar preservação do HTML no diff e no JSON Patch de criação/edição, sem transformação automática.
- Preservar conteúdo existente e edição parcial, regras de PBI, fatos disponíveis e aprovação de propostas.

## Fora de escopo

- Editar work items reais, converter Markdown automaticamente ou sanitizar/reformatar conteúdo existente indiscriminadamente.
- Afirmar reprodução exata do layout visual remoto sem validação na instalação real.

## Critérios de aceite

- [x] Ferramentas e campos de criação/edição orientam HTML real, listas e espaçamento por blocos.
- [x] Exemplo ilustrativo não obriga seções, CSS, cores ou fatos novos.
- [x] HTML é preservado no diff, POST e PATCH; strings comuns e edições não relacionadas mantêm compatibilidade.
- [x] Tipos, lint, testes, cobertura, build e workflow aprovados.

## Evidências

- O cliente TFS envia description e acceptanceCriteria diretamente no JSON Patch; não remove tags nem converte Markdown. Prints são compatíveis com envio de texto sem blocos HTML, mas o payload original não foi consultado.
- Orientação centralizada em src/modules/tfs/text-guidance.ts, publicada nas duas ferramentas e nos dois schemas de campo; livre organização, exemplos opcionais e preservação do padrão PBI.
- Testes MCP verificam instruções nos modos de confirmação true/false e preservação exata de parágrafos, listas, destaques e entidades HTML no diff, POST, PATCH e leitura normalizada, sem campos extras na edição.
- `npm run typecheck`, `npm run lint`, `npm test` e `npm run test:coverage`: aprovados (14 arquivos, 101 testes; 76,71% de linhas). `npm run build`, `npm run validate:workflow` e `git diff --check`: aprovados em 2026-10-02.
- Nenhuma chamada a serviços reais, alteração do Bug do print ou commit/push. Não foi feita validação visual na instalação remota; os testes asseguram preservação do HTML, não layout exato.
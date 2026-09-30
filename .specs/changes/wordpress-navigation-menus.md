---
id: wordpress-navigation-menus
status: concluded
created: 2026-09-30
updated: 2026-09-30
---

# Menus de navegação WordPress

## Objetivo

Ler menus reais e permitir associar páginas existentes e reorganizar itens hierárquicos nas wikis user e developer com plano, diff e preflight.

## Escopo

- Descoberta leve de menus, leitura paginada de itens e sugestão fundamentada no menu e na ancestralidade reais.
- Preparação de inserção e edição de item em menu existente, com escopo de política, detecção de conflito e confirmação independente da criação da página.
- Orientar fluxo sequencial: criar página, propor posição, confirmar e adicionar; se falhar ou for ambíguo, reportar explicitamente que a página não entrou no menu, com motivo e pedido de localização.

## Fora de escopo

- Escrita real durante desenvolvimento; alterações em menus sem confirmação da localização; deleção de menus ou itens; criação de menus.
- Transação atômica entre criação de página e inclusão no menu (duas escritas remotas independentes).

## Critérios de aceite

- [x] Ambas as wikis suportam listar menus/itens, sugerir posição e preparar inserção/edição de itens.
- [x] Posição depende de IDs verificados remotamente, sem invenção de menu ou item pai.
- [x] A inclusão confirma escopo da página, menu e item pai; preflight bloqueia mudanças concorrentes.
- [x] Nenhum teste comum escreve em serviço real; falha ou ambiguidade resulta em instrução explícita para informar menu/posição.
- [x] Typecheck, lint, testes, cobertura, build e validação do workflow aprovados.

## Riscos

- A API de menus não expõe modified_gmt; comparar snapshots estruturais até o preflight não torna duas operações remotas atômicas.
- Dois planos e duas confirmações independentes para página e item de menu; falha da segunda preserva a página sem entrada no menu.

## Evidências

- Leitura autenticada opt-in em 2026-09-30: menu Software e desenvolvimento da wiki developer retornou 271 itens; API expõe GET/POST/PATCH para menu-items e a conta informa edit_theme_options. Nenhuma escrita remota foi feita.
- Testes MCP com fetch simulado para ambas as wikis: criação de página e inclusão confirmáveis em planos separados, sugestão positiva/ambígua, edição, rascunho, duplicação, ciclo, conflito e allowlist de menus. Paginação exata de 100 itens coberta por teste do cliente.
- `npm run typecheck`, `npm run lint`, `npm test` (12 arquivos, 62 testes), `npm run test:coverage` (75,38% de linhas), `npm run build` e `npm run validate:workflow`: aprovados. `git diff --check` sem erro. Nenhuma escrita real em WordPress.
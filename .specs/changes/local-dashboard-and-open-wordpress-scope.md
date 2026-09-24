---
id: local-dashboard-and-open-wordpress-scope
status: concluded
owner: local
created: 2026-09-24
updated: 2026-09-24
---

# Painel local e escopo WordPress aberto por padrão

## Objetivo

Facilitar o primeiro uso do MCP Sarah e tratar allowlists WordPress vazias como acesso irrestrito.

## Escopo

- Permitir todas as páginas e posts quando suas listas de IDs estiverem vazias.
- Permitir mídia de qualquer caminho local quando a lista de raízes estiver vazia.
- Preservar validação de arquivo, MIME, tamanho, hash, confirmação e lixeira recuperável.
- Fazer `npm run dev` iniciar o MCP e abrir um painel local de orientação.
- Mostrar status, escopos, ferramentas e passos de configuração sem expor segredos.

## Riscos

- Um agente poderá preparar alterações em qualquer conteúdo WordPress acessível pela credencial.
- Um agente poderá preparar upload de qualquer imagem ou PDF legível pelo processo.
- O painel precisa escutar somente em loopback e não pode oferecer execução de mutações.

## Critérios de aceite

- [x] Listas WordPress vazias significam `all`; listas preenchidas continuam restritivas.
- [x] `npm run dev` mantém o MCP em `stdio` e abre o painel local.
- [x] O painel mostra configuração, alcance, ferramentas e instruções sem credenciais.
- [x] Typecheck, lint, testes, build, skill e workflow passam.

## Evidências

- `npm run typecheck` e `npm run lint`: aprovados.
- `npm test`: 11 arquivos e 36 testes aprovados, incluindo processo real do painel local.
- `npm run test:coverage` e `npm run build`: aprovados.
- `npm run test:live`: dois módulos alcançáveis por leitura.
- `npm run validate:workflow`: aprovado.
- Skill `wordpress-integration`: aprovada pelo `quick_validate.py`.

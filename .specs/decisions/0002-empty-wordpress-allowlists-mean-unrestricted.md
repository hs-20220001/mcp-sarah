---
id: ADR-0002
status: accepted
date: 2026-09-24
---

# Allowlists WordPress vazias significam acesso irrestrito

## Contexto

O operador prefere que a ausência de IDs ou raízes configuradas não bloqueie o uso inicial da integração.

## Decisão

`allowedPageRootIds: []`, `allowedPostCategoryIds: []` e `WP_ALLOWED_MEDIA_ROOTS` vazio significam que todo o escopo correspondente está permitido. Quando uma lista possui valores, ela funciona como allowlist restritiva.

## Consequências

- A configuração inicial funciona sem descobrir IDs ou diretórios previamente.
- A credencial WordPress passa a ser o principal limite de autorização para páginas e posts.
- Uploads continuam limitados a formatos e tamanhos permitidos e exigem associação a conteúdo acessível.
- Toda escrita continua usando plano, diff, confirmação literal, preflight e remoção recuperável.
- O painel e a documentação devem destacar quando o modo irrestrito está ativo.

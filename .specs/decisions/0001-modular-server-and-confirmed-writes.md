---
id: ADR-0001
status: accepted
date: 2026-09-24
---

# Servidor modular e escritas confirmadas em duas fases

## Contexto

O mesmo servidor precisa integrar sistemas distintos sem acoplar regras, credenciais ou modelos externos. Agentes de IA também precisam executar mutações sem ampliar silenciosamente seu impacto.

## Decisão

Cada integração implementa `IntegrationModule` e recebe um contexto comum. `createServer()` não conhece transporte. Toda escrita é representada por um plano efêmero contendo exatamente uma mutação, diff, pré-condição e executor. A aplicação requer token secreto do plano e a confirmação literal `CONFIRMO`.

## Consequências

- Novos módulos não alteram clientes TFS ou WordPress.
- Planos não sobrevivem ao processo e expiram por TTL.
- Uma operação em lote deve ser decomposta em planos independentes.
- Falhas de rede ambíguas nunca são repetidas automaticamente.
- Auditoria registra metadados, não o conteúdo completo.

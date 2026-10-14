# AGENTS

Este arquivo é a entrada rápida para qualquer agente de IA que trabalhe no MCP Sarah. O contexto durável está em `.specs`; a documentação do produto está em `docs`.

## Como começar

1. Leia `.specs/active-change.md` e a mudança ativa indicada nela.
2. Consulte `.specs/memory/project-facts.md` e `.specs/memory/risks-and-gotchas.md`.
3. Use a skill local adequada em `.agents/skills`.
4. Faça a menor mudança coerente e execute as validações proporcionais descritas em `.specs/shared/validation-and-learning.md`.

## Regras essenciais

- Código, tipos e nomes internos ficam em inglês; documentação e mensagens operacionais em português do Brasil.
- Nunca exponha `.env`, PAT, Application Password ou cabeçalhos de autenticação.
- Testes comuns não podem escrever em serviços reais. Testes ao vivo devem ser explícitos e opt-in.
- Por padrão, toda mutação remota segue `preparar → exibir diff → CONFIRMO → aplicar`; com `MCP_REQUIRE_CONFIRMATION=false`, segue `preparar → exibir diff → aplicar` mantendo token e preflight.
- Nunca use `destroy=true` no TFS nem `force=true` no WordPress.
- `stdout` é exclusivo do protocolo MCP. Logs estruturados usam `stderr`.
- Não invente estados, áreas, iterações, categorias, campos ou hierarquias remotas.
- Oracle oferece somente ferramentas de consulta; DEV é o ambiente padrão, HOM/PRO exigem pedido explícito e pedidos de escrita recebem orientação, nunca execução.
- Funções Oracle de packages podem ter efeitos colaterais mesmo em SELECT; allowlist vazia `ORACLE_READONLY_FUNCTIONS_<AMBIENTE>` permite todas as funções compatíveis concedidas ao usuário e lista preenchida restringe por `OWNER.PACKAGE.FUNCTION`; use transação READ ONLY.
- Não faça commit ou push sem pedido explícito.

## Fontes rápidas

- Arquitetura: `docs/architecture.md`
- Ferramentas: `docs/tools.md`
- Segurança: `docs/security.md`
- Comandos: `.specs/shared/commands.md`
- Decisões: `.specs/decisions`

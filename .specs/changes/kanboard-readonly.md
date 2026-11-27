---
id: kanboard-readonly
status: concluded
created: 2026-11-27
updated: 2026-11-27
---

# Consultas ao Kanboard

## Objetivo e escopo

Permitir que o agente liste projetos, liste tarefas por projeto e consulte uma tarefa por ID. Configurar o endpoint e a chave apenas no ambiente local, com campos de exemplo sem segredo. Não oferecer mutações nem um executor genérico de JSON-RPC.

## Critérios de aceite

- Módulo independente, registrado no catálogo e no status, com probe opcional.
- Usar JSON-RPC 2.0 sobre HTTPS por padrão; HTTP somente com autorização local para o endpoint exato. Não expor credenciais em resultados, tokens de projeto nem erros remotos brutos. O transporte HTTP não oferece sigilo em trânsito.
- Validar consultas com contratos simulados, incluindo falhas de configuração, autenticação e protocolo. Não conectar à instalação real.

## Evidências (2026-11-27)

- Typecheck, lint, build, validação do workflow e `git diff --check` aprovados. Suíte completa simulada: 130 testes em 16 arquivos; cobertura de linhas de 100% no módulo Kanboard.
- Testes em memória exercitaram o catálogo, autenticação dos dois tipos, paginação, tarefas abertas/fechadas, projeção sem tokens, detalhe, erros e probe opcional sem consultar a instalação real.
- Nenhuma alteração no `.env` local. Inspeção visual do painel delegada ao usuário.
- Exceção HTTP por URL exata: simulados os transportes HTTP e HTTPS, a recusa de outro host/porta/caminho, a validação estrutural e o aviso no status. Typecheck, lint, 137 testes, build, workflow e diff-check aprovados. Nenhuma chave real transmitida.
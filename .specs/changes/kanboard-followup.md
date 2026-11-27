---
id: kanboard-followup
status: concluded
created: 2026-11-27
updated: 2026-11-27
---

# Acompanhamento de chamados em dois sistemas

- Relatórios e leituras de chamados devem confrontar estados, datas, comentários e evidência de correspondência no TFS, nos dois sentidos. Ausência de referência, indisponibilidade e divergência não autorizam sincronização.
- Buscar em lotes limitados, sem filtrar por estado. Separar tag exata, referência por URL e chamado relacionado; nunca seguir URLs do conteúdo ou usar assunto/número solto como prova.
- Chave global é somente leitura. Com conta pessoal, permitir comentar ou editar título/descrição via plano individual com identidade verificada no servidor, alvo e conteúdo explícitos. Exigir aprovação do solicitante mesmo no modo sem confirmação literal; sem fechamento, exclusão, atribuição ou RPC livre.
- Critérios: testes simulados dos dois modos, resultados parciais e múltiplos, ausência de dados sensíveis no relatório, confirmação vinculada ao plano, conflitos, falha sem retry. Sem alteração de credenciais nem escrita real.

## Evidências — 2026-11-27

- Typecheck, lint e build passaram. Suíte completa com cobertura: 154 testes em 17 arquivos; 99,35% de cobertura de linhas no módulo Kanboard. Validação do workflow e `git diff --check` aprovados.
- Em memória: catálogo somente leitura com chave global, inclusive variações de caixa; negação no cliente antes de qualquer RPC de escrita; conferência de `getMe` antes/depois, aprovação de login/alvo/campo/valor, mudança concorrente, escrita única e erro ambíguo sem retry.
- Relatório testado com tag exata, links nos dois sentidos, outro chamado, colisão de prefixo numérico, domínio/projeto diferente, itens múltiplos, datas nas duas direções, truncamento e indisponibilidade. Sem consulta ou escrita em serviços internos nesta mudança; nenhum ajuste nas credenciais locais. Inspeção visual não executada.
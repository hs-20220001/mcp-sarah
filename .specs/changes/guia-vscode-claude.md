---
id: guia-vscode-claude
status: concluded
created: 2026-11-27
updated: 2026-11-27
---

# Guia de instalação no VS Code com Claude

## Objetivo e escopo

- Criar um guia Markdown compartilhável para o, considerando Windows, Claude Code e Copilot com modelo Claude.
- Consolidar instalação, configuração por integração, campos obrigatórios/opcionais, segurança, verificação, atualização e diagnóstico.
- Não copiar credenciais, hosts internos ou configurações pessoais; não alterar runtime, ambiente local nem autenticações. Sem commit ou push.

## Critérios de aceite

- Distinguir as duas extensões e seus formatos de configuração MCP.
- Documentar todas as variáveis do modelo de ambiente, deixando clara a obrigatoriedade condicional por integração.
- Garantir pasta de trabalho na inicialização, caminhos exemplificativos e instruções de reinício.
- Validar workflow, links locais, cobertura de variáveis e diff; não executar serviços remotos nem inspeção visual.

## Evidências

- Documentação oficial Claude Code MCP consultada para sintaxe stdio e escopos; configurações conferidas com código e modelo do repositório.
- `npm run validate:workflow` aprovado; `git diff --check` aprovado. Verificação automatizada confirmou as 42 variáveis do modelo no guia, links locais existentes e ausência de hosts internos.
- Alteração somente documental; runtime, credenciais e autenticações preservados. Sem chamadas a integrações reais, commit ou push. Inspeção visual e conexão na máquina do colega ficam a cargo dos usuários; não foram executadas nesta mudança.
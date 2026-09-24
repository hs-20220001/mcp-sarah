# Validação e aprendizado

## Matriz mínima

- Documentação/skills: `npm run validate:workflow`.
- Código interno: `npm run typecheck`, `npm run lint` e testes focados.
- Contratos MCP ou integrações: suíte completa, cobertura e build.
- Credenciais ou chamadas reais: somente smoke test opt-in, sem escrita por padrão.

## Fechamento

Antes de concluir uma mudança:

1. Registre as evidências na spec ativa.
2. Atualize fatos e riscos que continuem válidos.
3. Atualize catálogo e exemplos se o contrato público mudou.
4. Verifique o diff por segredos e alterações não relacionadas.

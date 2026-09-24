# Sistema de especificações

`.specs` registra intenção, fatos, decisões e aprendizado sem transformar `AGENTS.md` em um manual extenso.

## Fluxo

1. Aponte `active-change.md` para uma mudança em `changes`.
2. Registre objetivo, escopo, critérios e riscos antes de implementar.
3. Classifique informações duráveis como fato, decisão, risco ou hipótese.
4. Durante a execução, mantenha o estado da mudança como `planned`, `in_progress`, `validated` ou `concluded`.
5. Após validar, atualize memória e documentação afetadas e mova mudanças históricas para `archive` quando fizer sentido.

Validação é proporcional ao risco: documentação exige links e estrutura; núcleo e políticas exigem testes; integrações exigem contratos simulados; escrita real exige sandbox e confirmação explícita.

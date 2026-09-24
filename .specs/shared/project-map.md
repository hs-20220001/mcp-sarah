# Mapa do projeto

- `src/core`: configuração, HTTP, erros, logs, operações, snapshots e resultados MCP.
- `src/modules/tfs`: política, tipos, cliente REST e ferramentas TFS.
- `src/modules/wordpress`: política, tipos, cliente REST e ferramentas WordPress.
- `config`: políticas YAML versionadas, sem credenciais.
- `tests`: testes unitários, contratos simulados e MCP em memória.
- `docs`: documentação para pessoas e operadores.
- `dashboard`: painel local de orientação servido por `npm run dev`.
- `scripts/dev.ts`: inicia o painel local e o transporte MCP `stdio` para desenvolvimento.
- `.agents/skills`: instruções locais para agentes de IA.
- `.specs`: intenção, fatos, decisões, templates e validação.
- `tsconfig.build.json`: emissão de produção com `dist/index.js` como entrada.

# Fatos do projeto

- O projeto é independente do Centro Cirúrgico e do `tfs-copilot` em runtime.
- Runtime: Node.js 20+, TypeScript estrito, ESM e npm.
- Transporte inicial: MCP `stdio`; `stdout` pertence ao protocolo.
- Integrações iniciais: TFS/Azure DevOps Server 2022 REST 7.0 e WordPress REST API.
- Todas as integrações implementadas são registradas automaticamente; não existe seletor global de módulos.
- Allowlists WordPress vazias significam escopo irrestrito; listas preenchidas são restritivas.
- `npm run dev` abre um painel somente local para status, ferramentas e orientação.
- O cliente de IA não precisa fornecer uma chave OpenAI ao servidor.
- Exclusões são sempre recuperáveis.
- Planos ficam apenas em memória e expiram por padrão em 15 minutos.
- Documentação e mensagens públicas usam português do Brasil; implementação usa inglês.
- Comentários de work items TFS usam a API `7.0-preview.3`, separada da versão geral configurada para Work Items.
- `MCP_REQUIRE_CONFIRMATION` é `true` por padrão; `false` remove somente o campo literal `CONFIRMO` de `operations_apply`.
- WordPress aceita os perfis `user` e `developer` com a mesma credencial; `WP_BASE_URL` legado representa `user`, e dois perfis exigem `wiki` explícito nas ferramentas quando ambos estão configurados.

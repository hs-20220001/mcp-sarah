# MCP Sarah

Servidor MCP local e modular para oferecer a agentes de IA acesso controlado a ferramentas internas. A primeira versão integra Azure DevOps Server/TFS e WordPress sem depender de um provedor de IA específico.

## Características

- Transporte local `stdio` usando o SDK MCP TypeScript v2.
- Painel local de orientação e status aberto por `npm run dev`.
- Módulos independentes, registrados automaticamente quando fazem parte do projeto.
- Consultas paginadas e resultados estruturados.
- Comentários de work items TFS com leitura, inserção, alteração e deleção recuperável.
- Escritas em duas fases: preparar, revisar o diff e aplicar após `CONFIRMO`.
- Modo local opt-in sem `CONFIRMO` via `MCP_REQUIRE_CONFIRMATION=false`, mantendo token, preflight e auditoria.
- Controle de concorrência por revisão, data de modificação ou hash do arquivo.
- Exclusões apenas para lixeira; não existe ferramenta de destruição permanente.
- Políticas versionadas para tipos/campos do TFS e escopos do WordPress.
- Logs em `stderr`, auditoria opcional e redação de segredos.

## Pré-requisitos

- Node.js 20 ou superior; o desenvolvimento atual usa Node 24.
- PAT do Azure DevOps com acesso mínimo necessário a Work Items e metadados do projeto.
- WordPress 5.6 ou superior, HTTPS e Application Password dedicado à integração.

## Configuração

```powershell
npm install
Copy-Item .env.example .env
```

Preencha o `.env` local. O arquivo é ignorado pelo Git. As variáveis completas estão documentadas em [docs/configuration.md](docs/configuration.md).

Você pode restringir escritas no WordPress em `config/wordpress.yaml`:

- `allowedPageRootIds`: páginas-raiz cujas árvores podem ser alteradas;
- `allowedPostCategoryIds`: categorias nas quais posts podem ser alterados;
- `WP_ALLOWED_MEDIA_ROOTS`: diretórios locais dos quais arquivos podem ser enviados.

Listas vazias significam acesso irrestrito ao escopo correspondente. Da mesma forma, `WP_ALLOWED_MEDIA_ROOTS` vazio permite mídia de qualquer caminho local legível. Formato, tamanho, hash, confirmação e lixeira segura continuam obrigatórios.

Para uma única wiki, `WP_BASE_URL` continua disponível e representa a wiki pública dos usuários. Para duas wikis, configure `WP_USER_BASE_URL` e `WP_DEVELOPER_BASE_URL`; ambas compartilham usuário, Application Password e raízes locais de mídia. Nesse caso, informe `wiki=user` ou `wiki=developer` em cada ferramenta WordPress. Sem essa escolha, o servidor retorna `AMBIGUOUS_REQUEST` sem acessar o WordPress.

## Começando sem experiência técnica

```powershell
npm run dev
```

Esse comando abre `http://127.0.0.1:3333` no navegador e mantém o painel ativo. Nele você verá as integrações, poderá testar somente leitura e consultar todas as ferramentas. Para encerrar, volte ao terminal e pressione `Ctrl+C`.

`npm run dev` é uma tela de orientação; ele não é obrigatório para o uso diário no Codex. O Codex inicia sua própria instância do servidor MCP configurada abaixo. O processo usa `stdout` exclusivamente para JSON-RPC MCP e envia diagnósticos para `stderr`.

Leia o [passo a passo para iniciantes](docs/getting-started.md) para a sequência completa.

## Configuração no Codex

Primeiro execute `npm run build`. Depois adicione ao `~/.codex/config.toml`, ajustando o caminho absoluto:

```toml
[mcp_servers.mcp_sarah]
command = "node"
args = ["dist/index.js"]
cwd = "E:\\localdev\\mcp-sarah"
default_tools_approval_mode = "writes"
startup_timeout_sec = 20
tool_timeout_sec = 60
```

O servidor lê as credenciais do `.env` porque o `cwd` aponta para este projeto. Reinicie o Codex depois de alterar a configuração e use `/mcp` para verificar o servidor.

Para outro host MCP, configure um servidor `stdio` com comando `node`, argumento `dist/index.js`, diretório deste projeto e as mesmas variáveis de ambiente.

## Fluxo de escrita

1. Chame uma ferramenta `*_prepare_*`.
2. Mostre ao usuário o `diff`, o alvo e a expiração retornados.
3. Aguarde a confirmação literal `CONFIRMO`.
4. Chame `operations_apply` com `operationId`, `confirmationToken` e `confirmation`.
5. Se houver conflito ou resultado de rede ambíguo, consulte o sistema antes de tentar novamente.

O token é de uso único e expira por padrão em 15 minutos. Reiniciar o servidor invalida planos pendentes.
Com `MCP_REQUIRE_CONFIRMATION=false`, pule somente a etapa da resposta literal e não envie `confirmation`; o token continua obrigatório. O host MCP ainda pode ter uma aprovação própria para ferramentas de escrita.

## Qualidade

```powershell
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run test:live # somente com MCP_LIVE_TESTS=CONFIRMO_LEITURA
npm run build
npm run validate:workflow
```

Testes ao vivo não fazem parte do fluxo padrão. `test:live` faz apenas probe de autenticação e leitura e exige `MCP_LIVE_TESTS=CONFIRMO_LEITURA`. Escritas reais só devem ocorrer por um host MCP, em sandbox explícito e pelo fluxo normal de confirmação.

## Documentação

- [Histórico de alterações e versões](CHANGELOG.md)
- [Arquitetura](docs/architecture.md)
- [Passo a passo para iniciantes](docs/getting-started.md)
- [Configuração](docs/configuration.md)
- [Catálogo de ferramentas](docs/tools.md)
- [Segurança](docs/security.md)
- [Tratamento de erros](docs/errors.md)
- [Integração TFS](docs/integrations/tfs.md)
- [Integração WordPress](docs/integrations/wordpress.md)
- [Fluxo assistido por IA](.specs/README.md)

## Adicionando uma integração

1. Crie um módulo isolado com cliente, tipos, política e ferramentas.
2. Implemente `IntegrationModule` e valide apenas as credenciais do módulo.
3. Registre o módulo em `createServer()`.
4. Use o serviço comum de operações para qualquer escrita.
5. Documente contratos, riscos e testes e atualize o catálogo de ferramentas.

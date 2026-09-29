# Configuração

## Núcleo

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `MCP_REQUEST_TIMEOUT_MS` | `30000` | Timeout de cada requisição externa. |
| `MCP_CONFIRMATION_TTL_SECONDS` | `900` | Validade de planos de escrita. |
| `MCP_REQUIRE_CONFIRMATION` | `true` | Exige a resposta literal `CONFIRMO` antes de aplicar. Use `false` somente em ambiente local confiável; plano, token, diff, preflight e aprovação do host continuam independentes. |
| `MCP_AUDIT_LOG_PATH` | `.local/audit.jsonl` | Auditoria local sem conteúdo integral; vazio desabilita. |
| `MCP_TFS_POLICY_PATH` | `config/tfs-sarah.yaml` | Perfil TFS versionado. |
| `MCP_WORDPRESS_POLICY_PATH` | `config/wordpress.yaml` | Política WordPress versionada. |
| `MCP_WORDPRESS_USER_POLICY_PATH` | usa `MCP_WORDPRESS_POLICY_PATH` | Política específica da wiki pública dos usuários. |
| `MCP_WORDPRESS_DEVELOPER_POLICY_PATH` | usa `MCP_WORDPRESS_POLICY_PATH` | Política específica da wiki da informática. |
| `MCP_DASHBOARD_PORT` | `3333` | Porta local aberta por `npm run dev`. |
| `MCP_DASHBOARD_OPEN` | `true` | Use `false` para não abrir o navegador automaticamente. |

## TFS

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `AZURE_DEVOPS_ORG_URL` | Sim | URL até a collection, sem o projeto. |
| `AZURE_DEVOPS_PROJECT` | Sim | Nome do projeto. |
| `AZURE_DEVOPS_PAT` | Sim | Personal Access Token. |
| `AZURE_DEVOPS_API_VERSION` | Não | Padrão `7.0`. |

## WordPress

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `WP_BASE_URL` | Uma URL | Compatibilidade para uma única wiki; é tratada como `user`. |
| `WP_USER_BASE_URL` | Uma URL | URL HTTPS da wiki pública dos usuários, sem `/wp-json`. |
| `WP_DEVELOPER_BASE_URL` | Uma URL | URL HTTPS da wiki da informática, sem `/wp-json`. |
| `WP_USERNAME` | Sim | Login associado ao Application Password. |
| `WP_APPLICATION_PASSWORD` | Sim | Senha revogável dedicada à integração. |
| `WP_ALLOWED_MEDIA_ROOTS` | Não | Raízes absolutas separadas pelo delimitador do sistema; vazio permite qualquer caminho local. |

É necessário informar pelo menos uma URL. `WP_BASE_URL` é mantida para compatibilidade e representa a wiki `user`; para duas wikis, preencha `WP_USER_BASE_URL` e `WP_DEVELOPER_BASE_URL`. As duas usam o mesmo usuário, Application Password e raízes locais de mídia. Quando os dois perfis estão configurados, toda ferramenta WordPress aceita `wiki=user` ou `wiki=developer`; sem essa escolha, retorna `AMBIGUOUS_REQUEST` com as opções possíveis.

Todas as integrações desenvolvidas são registradas automaticamente. Uma integração sem credenciais permanece visível no catálogo e no status, com `configured: false`; suas ferramentas retornam `CONFIG_MISSING` sem impedir o funcionamento das demais. O status mostra os perfis WordPress e suas URLs, sem credenciais.

## Políticas

O perfil TFS autoriza tipos e hierarquia, mapeia o campo de descrição e converte aliases amigáveis de `customFields` para reference names. O perfil Sarah inclui `priority`, `effort`, `businessValue` e os seis aliases Planning (`size`, `complexity`, `uncertainty`, `strategicImpact`, `tangibility`, `urgency`); opções declaradas na política são validadas antes de preparar a escrita. Acceptance Criteria usa o campo padrão `Microsoft.VSTS.Common.AcceptanceCriteria`. Para Tasks, `activity` enumera as sete opções exibidas pelo projeto, `remainingWork` aceita número e `blocked` aceita boolean; esses aliases só podem ser escritos em `Task`. A disponibilidade efetiva depende do processo TFS remoto.

A política WordPress autoriza árvores de páginas, categorias de posts, status, MIME types e tamanho máximo. `allowedPageRootIds: []` e `allowedPostCategoryIds: []` permitem todo o conteúdo correspondente; ao adicionar IDs, a lista passa a restringir o escopo. Ela não contém credenciais.

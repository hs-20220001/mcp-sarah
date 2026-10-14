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
| `ORACLE_CONNECT_STRING_DEV` / `_HOM` / `_PRO` | Não | Connect string Oracle por ambiente (host/porta/service name ou alias TNS). |
| `ORACLE_USER_DEV` / `_HOM` / `_PRO` | Não | Usuário padrão de cada perfil Oracle. |
| `ORACLE_PASSWORD_DEV` / `_HOM` / `_PRO` | Não | Senha correspondente ao usuário padrão de cada perfil Oracle. |
| `ORACLE_TNS_ADMIN_DEV` / `_HOM` / `_PRO` | Não | Caminho do diretório com `tnsnames.ora` para resolver aliases TNS em Thin mode. |
| `ORACLE_CLIENT_LIB_DIR` | Não | Diretório do Oracle Instant Client 19+ para ativar o modo Thick. Vazio mantém Thin mode. |
| `ORACLE_CLIENT_CONFIG_DIR` | Não | Diretório TNS compartilhado no modo Thick; se vazio, usa `ORACLE_TNS_ADMIN_DEV`. |
| `ORACLE_READONLY_FUNCTIONS_DEV` / `_HOM` / `_PRO` | Não | Allowlist opcional para restringir funções, em `OWNER.PACKAGE.FUNCTION`, separadas por vírgula. Vazia, permite qualquer função compatível que o usuário possa executar; preenchida, permite apenas as listadas. |
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

Todas as integrações desenvolvidas são registradas automaticamente. Uma integração sem credenciais permanece visível no catálogo e no status, com `configured: false`; suas ferramentas retornam `CONFIG_MISSING` sem impedir o funcionamento das demais. O status mostra os perfis WordPress e ambientes Oracle configurados, sem credenciais.

## Oracle

Configure os trios `ORACLE_CONNECT_STRING_<AMBIENTE>`, `ORACLE_USER_<AMBIENTE>` e `ORACLE_PASSWORD_<AMBIENTE>` para `DEV`, `HOM` e `PRO`, conforme necessário. A seleção padrão é sempre `DEV`; HOM ou PRO só são acessados quando o usuário pedir explicitamente e o agente informar esse ambiente. O MCP não faz fallback silencioso se DEV não estiver configurado.

As ferramentas aceitam `username` opcional para tentar outro usuário no mesmo ambiente, sempre reutilizando a senha configurada para aquele perfil; isso não altera `.env`. O login alternativo é validado como identificador Oracle simples. Requer Node.js 20+. Por padrão, usa Thin mode, sem Instant Client. Para connect string, use `host:1521/service_name` ou um alias TNS. Em Thin mode o driver não encontra automaticamente o arquivo `tnsnames.ora`: configure `ORACLE_TNS_ADMIN_<AMBIENTE>` com o diretório que contém esse arquivo. O alias configurado no SQL Developer pode apontar para um arquivo TNS que não está visível ao processo MCP.

Se a autenticação retornar `NJS-116` (verificador de senha incompatível com Thin mode), configure `ORACLE_CLIENT_LIB_DIR` com o diretório do Oracle Instant Client 19+; o MCP passará a usar Thick mode. Nesse modo, a resolução de aliases TNS usa um diretório compartilhado para o processo: `ORACLE_CLIENT_CONFIG_DIR`, ou `ORACLE_TNS_ADMIN_DEV` quando a primeira estiver vazia. Os aliases usados por DEV/HOM/PRO devem constar desse diretório compartilhado. O caminho de uma instalação antiga do Oracle Client pode fornecer `tnsnames.ora`, mas não serve necessariamente como biblioteca para o modo Thick.

`oracle_query` só aceita uma instrução `SELECT` (sem `WITH` ou `FOR UPDATE`), binds escalares nomeados e até 500 linhas. `oracle_describe_table` consulta colunas e metadados disponíveis; `oracle_list_package_functions` lista funções e assinaturas visíveis; `oracle_call_package_function` chama função escalar com argumentos IN suportados. Se `ORACLE_READONLY_FUNCTIONS_<AMBIENTE>` estiver vazia, qualquer função compatível e executável pelo usuário Oracle poderá ser chamada; se preenchida, somente as assinaturas listadas são aceitas. Todas as chamadas iniciam uma transação Oracle `READ ONLY`, sem APIs MCP de escrita. Se o usuário pedir alteração, o agente deve informar que não é possível alterar por este MCP e oferecer orientação.

## Políticas

O perfil TFS autoriza tipos e hierarquia, mapeia o campo de descrição e converte aliases amigáveis de `customFields` para reference names. O perfil Sarah inclui `priority`, `effort`, `businessValue` e os seis aliases Planning (`size`, `complexity`, `uncertainty`, `strategicImpact`, `tangibility`, `urgency`); opções declaradas na política são validadas antes de preparar a escrita. Acceptance Criteria usa o campo padrão `Microsoft.VSTS.Common.AcceptanceCriteria`. Para Tasks, `activity` enumera as sete opções exibidas pelo projeto, `remainingWork` aceita número e `blocked` aceita boolean; esses aliases só podem ser escritos em `Task`. A disponibilidade efetiva depende do processo TFS remoto.

A política WordPress autoriza árvores de páginas, categorias de posts, IDs de menus para escrita, status, MIME types e tamanho máximo. `allowedPageRootIds: []`, `allowedPostCategoryIds: []` e `allowedMenuIds: []` permitem todo o escopo correspondente; ao adicionar IDs, a lista passa a restringir o escopo. Perfis `user` e `developer` podem usar políticas distintas. Ela não contém credenciais.

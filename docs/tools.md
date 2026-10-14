# Catálogo de ferramentas

## Núcleo

- `system_get_status`: configuração não sensível e probe opcional.
- `operations_get`: consulta plano sem revelar token.
- `operations_apply`: aplica plano após `CONFIRMO`; com `MCP_REQUIRE_CONFIRMATION=false`, aplica sem esse campo, mantendo token e preflight.
- `operations_cancel`: cancela plano pendente.

## TFS

- `tfs_list_saved_queries`: navega queries salvas.
- `tfs_preview_saved_query`: cria snapshot de uma query salva.
- `tfs_search_work_items`: consulta por filtros seguros.
- `tfs_list_work_items`: continua snapshot.
- `tfs_get_work_item`: obtém item, relações, descrição, Acceptance Criteria, aliases de custom fields e revisão.
- `tfs_list_work_item_comments`: lista comentários de um work item com continuation token.
- `tfs_list_classifications`: consulta áreas ou iterações.
- `tfs_prepare_create_work_item`: prepara criação; para PBI, orienta a história inicial entre aspas e em itálico, com `Como`, `quero` e `para` também em negrito, antes dos detalhes. Para Tasks sem categorias/quantidade especificadas, sugere quatro filhas (Desenvolvimento, Documentação, Comunicação e Testes). O sufixo do título usa apenas palavras do título do PBI, sem adicionar preposições; se houver contexto, a Task pode ter breve descrição do trabalho. Responsável, área e iteração ausentes são herdados do PBI pai, sem sobrepor valores explícitos, e o preflight bloqueia se o pai mudar.
- `tfs_prepare_update_work_item`: prepara edição parcial; aceita `acceptanceCriteria`, `activity` para Bug/Task e `remainingWork`/`blocked` exclusivos de Task. Para Bug, orienta aprovação de antes/depois, sem normalização indiscriminada, e recalcula Effort somente quando dimensões são alteradas.
- `tfs_prepare_trash_work_item`: prepara envio recuperável à recycle bin, inclusive de Tasks.
- `tfs_prepare_create_work_item_comment`: prepara inserção de comentário.
- `tfs_prepare_update_work_item_comment`: prepara alteração de comentário.
- `tfs_prepare_delete_work_item_comment`: prepara deleção recuperável de comentário.

Na criação de Bug, o MCP orienta pesquisar o prefixo real do sistema, áreas/iterações existentes e uma Feature pai na hierarquia Epic → Feature → PBI/Bug → Task. A preparação exige pai, área e iteração; Activity recebe Development por padrão. As estimativas seguem a [matriz de esforço](integrations/tfs-effort-reference.md), incluída nas descrições MCP. É sugerida somente uma Task opcional Testing com prefixo Testes -, herdando os valores conhecidos do Bug pai. Criação/edição de Bug e sua Task de Testes exigem proposta estruturada e aprovação conversacional mesmo no modo sem CONFIRMO literal; detalhes na [integração TFS](integrations/tfs.md#bugs). A aprovação conversacional é orientação ao agente, não validação técnica da fala do usuário pelo servidor.

## WordPress

- Todas as ferramentas WordPress aceitam `wiki=user` (wiki pública dos usuários) ou `wiki=developer` (wiki da informática) quando os dois perfis estão configurados. Sem a escolha, a ferramenta retorna `AMBIGUOUS_REQUEST` e não acessa o serviço.
- `wordpress_search_content` e `wordpress_get_content`: páginas/posts.
- `wordpress_search_media` e `wordpress_get_media`: anexos.
- `wordpress_list_menus`: descobre menus reais da wiki, sem baixar todos os itens.
- `wordpress_list_menu_items`: lista itens e hierarquia de um menu real com paginação.
- `wordpress_suggest_menu_placement`: consulta o menu candidato e sugere item pai somente se for inequívoco; caso contrário, pede menu e posição ao usuário.
- `wordpress_prepare_create_content`: prepara página/post, com `draft` padrão.
- `wordpress_prepare_create_menu_item`: prepara inclusão de página publicada em menu existente, depois de confirmar o menu e o item pai; plano independente do plano de criação da página.
- `wordpress_prepare_update_menu_item`: prepara mudança de pai, ordem ou rótulo de item de página no mesmo menu.
- `wordpress_prepare_update_content`: prepara edição parcial.
- `wordpress_prepare_trash_content`: prepara lixeira.
- `wordpress_prepare_upload_media`: valida arquivo, associação e hash.
- `wordpress_prepare_update_media`: prepara metadados.
- `wordpress_prepare_trash_media`: usa lixeira ou falha sem fallback permanente.

## Oracle

Todas as ferramentas Oracle escolhem `DEV` por padrão. Use `HOM` ou `PRO` somente quando o usuário pedir esse ambiente; não alterne silenciosamente. Um campo `username` opcional tenta a conexão com outro usuário e a senha já configurada para aquele ambiente. Aliases TNS exigem `ORACLE_TNS_ADMIN_<AMBIENTE>` apontando ao diretório com `tnsnames.ora` em Thin mode; em Thick mode, usam o diretório TNS compartilhado configurado para o processo. Se pedirem uma alteração no banco, informe que o MCP não pode realizá-la e ofereça orientação.

- `oracle_query`: executa uma única instrução `SELECT` (sem `WITH` ou `FOR UPDATE`), com binds nomeados e no máximo 500 linhas.
- `oracle_describe_table`: consulta colunas, tipos, precisão/escala, nulabilidade e defaults visíveis.
- `oracle_list_package_functions`: lista funções de package e parâmetros disponíveis em `ALL_PROCEDURES`/`ALL_ARGUMENTS`.
- `oracle_call_package_function`: executa função escalar com argumentos IN escalares; lista vazia em `ORACLE_READONLY_FUNCTIONS_<AMBIENTE>` permite qualquer função compatível, enquanto lista preenchida restringe a execução aos nomes exatos listados. Recusa sobrecarga ambígua, OUT/IN OUT e tipos compostos.

As chamadas começam uma transação Oracle `READ ONLY` e fecham a conexão. Não há ferramenta de DML, DDL ou procedure. Lista vazia é irrestrita para execução de funções e pode ampliar efeitos colaterais; `READ ONLY` não neutraliza transações autônomas ou efeitos externos. Restrinja o usuário Oracle e use allowlist preenchida quando necessária.

Ferramentas `prepare` alteram somente o estado temporário local do servidor. A mutação externa ocorre exclusivamente em `operations_apply`.

As descrições de criação/edição e os schemas de `description`/`acceptanceCriteria` orientam [HTML simples e legível](integrations/tfs.md#formatação-dos-campos-de-texto-rico): parágrafos separados, rótulos opcionais em negrito e listas reais. Markdown na proposta do chat não substitui HTML nos argumentos enviados ao TFS. A organização é flexível, sem template obrigatório nem conversão automática pelo servidor.

Resultados de pesquisa, queries salvas e snapshots incluem Acceptance Criteria e os `customFields` autorizados pela política (por exemplo, Priority, Effort, Business Value e os seis campos Planning). A descrição completa permanece disponível na leitura individual `tfs_get_work_item` para evitar incluí-la em toda listagem.

O ciclo de Task/PBI usa essas mesmas ferramentas genéricas: criação relaciona a Task ao PBI por `parentId`, edição usa verificação de revisão, e a remoção sempre é recuperável. Cada Task exige um plano separado; não há escrita em lote atômica.

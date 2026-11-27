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

## Kanboard

- `kanboard_list_projects`: lista projetos. Com chave da aplicação, usa `getAllProjects`; com token pessoal, `getMyProjects`.
- `kanboard_list_tasks`: lista tarefas de `projectId`, com filtro opcional `columnId` antes da paginação. O padrão `status: open` retorna as abertas; use `closed` para as fechadas.
- `kanboard_get_task`: consulta uma tarefa por `taskId`, incluindo descrição e link.

- `kanboard_list_task_comments`: comentários visíveis de uma tarefa, por ID decrescente, com datas e paginação.
- `kanboard_report_tasks`: cruza até 10 IDs de tarefas por chamada com o projeto TFS configurado, em qualquer estado. Para uma coluna inteira, percorra a lista até `nextOffset: null` e divida os IDs em lotes. Retorna estado do cartão, coluna, datas, quantidade de comentários e itens TFS com tipo, estado, datas, links e evidências. `latestActivitySide` compara datas, não mede progresso nem prova esquecimento; `stateChangedDate` é a mudança de estado quando o TFS a informa.
- `kanboard_prepare_task_write` (somente conta pessoal): `taskId`, `field` (`comment`, `title` ou `description`) e `value`. Cada plano tem uma única alteração. O diff identifica o ator autenticado, o alvo e o conteúdo. Exiba-os e aguarde aprovação explícita do solicitante. Só então envie esses mesmos três valores e o `username` autenticado em `kanboardApproval` ao aplicar. Não há argumento para trocar o autor ou a credencial.

**Como interpretar o relatório:** `integration_tag` identifica `kid:<ID>` exata. `url_reference` é uma referência por link, não necessariamente a origem do item. `other_task_reference` indica item marcado para outro chamado: não atribua seu desfecho ao cartão consultado. A busca considera links TFS na descrição/comentários do cartão e links Kanboard na descrição, reprodução ou aceite no TFS. Não relaciona números soltos, títulos parecidos ou anexos. Preserve todos os itens e separe Bugs/PBIs de Tasks/Features. Para explicar o andamento além das datas, confira comentários nos dois lados e Tasks filhas pertinentes. Aponte tanto cartão aberto com TFS concluído/removido quanto cartão fechado com TFS ainda aberto; nenhum desses casos autoriza sincronização automática.

`not_found` significa que não se encontrou vínculo nas fontes verificadas, não que ele inexiste. `partial`, `unavailableTasks`, `unresolvedIds`, `limited` ou `tfs_unavailable` devem ser informados; não os contabilize como ausência. Limites por lote: 100 IDs extraídos de links e 200 candidatos TFS; se houver truncamento, repita a consulta com menos cartões. O resumo não devolve corpos de comentários ou descrições.

As listas paginadas retornam `items`, `total` e `nextOffset` (nulo na última página). `limit` é 25 por padrão, até 50. A API fornece a lista completa; o MCP consulta novamente e recorta a página a cada chamada. Não há snapshot Kanboard.

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

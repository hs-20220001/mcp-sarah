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
- `tfs_get_work_item`: obtém item, relações, campos e revisão.
- `tfs_list_work_item_comments`: lista comentários de um work item com continuation token.
- `tfs_list_classifications`: consulta áreas ou iterações.
- `tfs_prepare_create_work_item`: prepara criação.
- `tfs_prepare_update_work_item`: prepara edição.
- `tfs_prepare_trash_work_item`: prepara envio à recycle bin.
- `tfs_prepare_create_work_item_comment`: prepara inserção de comentário.
- `tfs_prepare_update_work_item_comment`: prepara alteração de comentário.
- `tfs_prepare_delete_work_item_comment`: prepara deleção recuperável de comentário.

## WordPress

- Todas as ferramentas WordPress aceitam `wiki=user` (wiki pública dos usuários) ou `wiki=developer` (wiki da informática) quando os dois perfis estão configurados. Sem a escolha, a ferramenta retorna `AMBIGUOUS_REQUEST` e não acessa o serviço.
- `wordpress_search_content` e `wordpress_get_content`: páginas/posts.
- `wordpress_search_media` e `wordpress_get_media`: anexos.
- `wordpress_prepare_create_content`: prepara página/post, com `draft` padrão.
- `wordpress_prepare_update_content`: prepara edição parcial.
- `wordpress_prepare_trash_content`: prepara lixeira.
- `wordpress_prepare_upload_media`: valida arquivo, associação e hash.
- `wordpress_prepare_update_media`: prepara metadados.
- `wordpress_prepare_trash_media`: usa lixeira ou falha sem fallback permanente.

Ferramentas `prepare` alteram somente o estado temporário local do servidor. A mutação externa ocorre exclusivamente em `operations_apply`.

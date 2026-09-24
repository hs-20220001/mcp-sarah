# Integração TFS

## Contrato

- Azure DevOps Server 2022 / REST API `7.0`.
- Autenticação PAT em Basic Auth.
- Project e collection configuráveis.
- WIQL arbitrário não é exposto ao modelo; pesquisas são construídas a partir de filtros validados.

## Perfil Sarah

`config/tfs-sarah.yaml` permite `Epic`, `Feature`, `Product Backlog Item`, `Task` e `Bug`. Bugs usam `Microsoft.VSTS.TCM.ReproSteps`; os demais tipos usam `System.Description`. A mesma política declara quais tipos de pai são válidos para cada tipo de item, e essa relação é verificada na preparação e novamente antes da aplicação.

Aliases como `size`, `complexity`, `uncertainty`, `strategicImpact`, `tangibility`, `urgency`, `effort`, `businessValue` e `severity` são convertidos para os reference names configurados. Aliases desconhecidos são bloqueados.

## Concorrência e remoção

Edições incluem um teste de `rev` no JSON Patch e fazem preflight imediatamente antes da escrita. Remoções chamam o endpoint individual com `destroy=false`.

## Comentários

`tfs_list_work_item_comments` consulta os comentários pelo endpoint de Work Item Comments usando a API `7.0-preview.3`. A leitura aceita até 50 itens por página, `continuationToken`, ordem crescente ou decrescente e a opção `includeDeleted`.

`tfs_prepare_create_work_item_comment`, `tfs_prepare_update_work_item_comment` e `tfs_prepare_delete_work_item_comment` criam planos confirmáveis; nenhuma dessas ferramentas escreve diretamente no TFS. Alterações e deleções relêem a revisão do work item e a versão do comentário imediatamente antes da aplicação e bloqueiam conflitos. A deleção usa o `DELETE` da API de comentários, que marca o comentário como deletado e permite consultá-lo com `includeDeleted=true`.

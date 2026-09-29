# Integração TFS

## Contrato

- Azure DevOps Server 2022 / REST API `7.0`.
- Autenticação PAT em Basic Auth.
- Project e collection configuráveis.
- WIQL arbitrário não é exposto ao modelo; pesquisas são construídas a partir de filtros validados.

## Perfil Sarah

`config/tfs-sarah.yaml` permite `Epic`, `Feature`, `Product Backlog Item`, `Task` e `Bug`. Bugs usam `Microsoft.VSTS.TCM.ReproSteps`; os demais tipos usam `System.Description`. Para PBI, a ferramenta orienta o agente a iniciar a descrição em HTML com uma frase de história do usuário entre aspas e em itálico, seguida pelos detalhes, quando o usuário não pedir outro formato e houver contexto suficiente. Essa orientação não reescreve o conteúdo fornecido. A mesma política declara quais tipos de pai são válidos para cada tipo de item, e essa relação é verificada na preparação e novamente antes da aplicação.

## Campos de PBI

| Campo | Uso no MCP | Reference name / observação |
| --- | --- | --- |
| Description | `fields.description`; retornado por `tfs_get_work_item` | `System.Description` |
| Acceptance Criteria | `fields.acceptanceCriteria`; retornado na leitura individual e nos resultados paginados | `Microsoft.VSTS.Common.AcceptanceCriteria` |
| Priority | `fields.customFields.priority`; retornado em `customFields` | `Microsoft.VSTS.Common.Priority`; sem enumeração local, pois os valores dependem do processo |
| Effort | `fields.customFields.effort`; retornado em `customFields` | `Microsoft.VSTS.Scheduling.Effort` |
| Business Value | `fields.customFields.businessValue`; retornado em `customFields` | `Microsoft.VSTS.Common.BusinessValue` |
| Tamanho | `fields.customFields.size`; retornado em `customFields` | `Sarah.Tamanho`; valores `1 - Mínimo`, `2 - Médio`, `3 - Máximo` |
| Complexidade | `fields.customFields.complexity`; retornado em `customFields` | `Sarah.Complexidade`; valores `1 - Baixa`, `2 - Moderada`, `3 - Alta` |
| Incerteza | `fields.customFields.uncertainty`; retornado em `customFields` | `Sarah.Incerteza`; valores `1 - Baixa`, `2 - Moderada`, `3 - Alta` |
| Impacto Estratégico | `fields.customFields.strategicImpact`; retornado em `customFields` | `Sarah.ImpactoEstrategico`; valores `1 - Baixo`, `2 - Moderado`, `3 - Alto` |
| Tangibilidade | `fields.customFields.tangibility`; retornado em `customFields` | `Sarah.Tangibilidade`; valores `1 - Baixa`, `2 - Moderada`, `3 - Alta` |
| Urgência | `fields.customFields.urgency`; retornado em `customFields` | `Sarah.Urgencia`; valores `1 - Baixa`, `2 - Moderada`, `3 - Alta` |

Os aliases de custom fields são convertidos para os reference names configurados. Quando a política declara opções, só aceita os códigos (`1`, `2`, `3`) ou os rótulos listados; aliases desconhecidos ou valores não permitidos são bloqueados. `tfs_get_work_item` retorna a descrição, Acceptance Criteria e os aliases normalizados; resultados de pesquisa e snapshots incluem Acceptance Criteria e `customFields`, sem incluir a descrição HTML completa.

O exemplo também mostra `Personas affected` e `Mapped on SpecMap`. Esses campos não têm alias/reference name confirmado na política e, portanto, não são lidos nem escritos pelo MCP. É necessário consultar os metadados do tipo PBI na instalação TFS antes de os configurar; não se deve inferir o nome técnico pelo rótulo exibido.

Os reference names e valores ainda dependem do processo e do tipo configurados no servidor. A política local não verifica se os campos estão associados ao PBI, se são obrigatórios, graváveis ou se os valores correspondem às regras remotas.

## Tasks de PBI

Quando o usuário pedir Tasks para um PBI sem definir quantidade ou categorias, a orientação MCP sugere quatro Tasks filhas: Desenvolvimento, Documentação, Comunicação e Testes. Os títulos seguem `<Categoria em português> - <resumo curto do título do PBI>`; cada item usa `type: Task`, `parentId` igual ao ID do PBI e `customFields.activity` com o valor Activity correspondente (`Development`, `Documentation`, `Communication` ou `Testing`). Se o usuário especificar outro recorte, prevalece o pedido explícito.

| Campo visível na Task | Alias MCP | Reference name / validação |
| --- | --- | --- |
| Activity | `customFields.activity` | `Microsoft.VSTS.Common.Activity`; limitado a Task e às opções `Communication`, `Deployment`, `Design`, `Development`, `Documentation`, `Requirements`, `Testing` |
| Remaining Work | `customFields.remainingWork` | `Microsoft.VSTS.Scheduling.RemainingWork`; limitado a Task e exige número |
| Blocked | `customFields.blocked` | `Microsoft.VSTS.CMMI.Blocked`; limitado a Task e exige boolean |
| Priority | `customFields.priority` | `Microsoft.VSTS.Common.Priority`; mapeado também em PBI |
| Description, Title, State, Assigned To e relação Parent | campos genéricos | disponíveis na criação/edição; `parentId` é validado contra a hierarquia autorizada |

Os campos Activity, Remaining Work e Blocked são lidos em `customFields` ao consultar/listar Tasks e podem ser escritos em criação/edição. Os aliases escopados são omitidos da leitura de outros tipos e bloqueados para escrita neles. A configuração usa os reference names usuais; é necessário confirmar sua associação e gravação no WIT Task da instalação real. `Personas affected` está visível na tela, mas continua sem alias porque seu reference name não foi confirmado.

Criação, edição e deleção de Tasks usam as ferramentas genéricas `tfs_prepare_create_work_item`, `tfs_prepare_update_work_item` e `tfs_prepare_trash_work_item`. A deleção é envio recuperável à recycle bin (`destroy=false`). Um conjunto de quatro Tasks gera quatro planos independentes; cada um apresenta seu diff e passa por preflight e confirmação antes da escrita, sem garantia de transação atômica do conjunto.

## Concorrência e remoção

Edições incluem um teste de `rev` no JSON Patch e fazem preflight imediatamente antes da escrita. Remoções chamam o endpoint individual com `destroy=false`.

## Comentários

`tfs_list_work_item_comments` consulta os comentários pelo endpoint de Work Item Comments usando a API `7.0-preview.3`. A leitura aceita até 50 itens por página, `continuationToken`, ordem crescente ou decrescente e a opção `includeDeleted`.

`tfs_prepare_create_work_item_comment`, `tfs_prepare_update_work_item_comment` e `tfs_prepare_delete_work_item_comment` criam planos confirmáveis; nenhuma dessas ferramentas escreve diretamente no TFS. Alterações e deleções relêem a revisão do work item e a versão do comentário imediatamente antes da aplicação e bloqueiam conflitos. A deleção usa o `DELETE` da API de comentários, que marca o comentário como deletado e permite consultá-lo com `includeDeleted=true`.

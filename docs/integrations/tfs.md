# Integração TFS

## Contrato

- Azure DevOps Server 2022 / REST API `7.0`.
- Autenticação PAT em Basic Auth.
- Project e collection configuráveis.
- WIQL arbitrário não é exposto ao modelo; pesquisas são construídas a partir de filtros validados.

## Perfil Sarah

`config/tfs-sarah.yaml` permite `Epic`, `Feature`, `Product Backlog Item`, `Task` e `Bug`. Bugs usam `Microsoft.VSTS.TCM.ReproSteps`; os demais tipos usam `System.Description`. Para PBI, a ferramenta orienta o agente a iniciar a descrição em HTML com uma frase de história do usuário entre aspas e em itálico, com `Como`, `quero` e `para` também em negrito; depois vêm os detalhes, quando o usuário não pedir outro formato e houver contexto suficiente. Exemplo: `<p><em>"<strong>Como</strong> [persona], <strong>quero</strong> [objetivo], <strong>para</strong> [benefício]."</em></p>`, seguido por outros parágrafos. Essa orientação não reescreve o conteúdo fornecido. A mesma política declara quais tipos de pai são válidos para cada tipo de item, e essa relação é verificada na preparação e novamente antes da aplicação.

## Formatação dos campos de texto rico

`description` (Description ou Steps to Reproduce) e `acceptanceCriteria` recebem **HTML simples real**. O chat pode apresentar a proposta em Markdown, mas o agente deve enviar o conteúdo aprovado em HTML: quebras de linha `\n`, linhas vazias, hífens e números digitados não garantem estrutura visual no TFS e podem aparecer concatenados.

- Separar blocos com `<p>...</p>` e destacar rótulos curtos com `<strong>` quando ajudar a leitura.
- Usar `<ul><li>...</li></ul>` para itens independentes e `<ol><li>...</li></ol>` para passos/critérios numerados, um `<li>` por item. Não reunir `1. ... 2. ...` em um único parágrafo.
- Usar `<br>` apenas para uma quebra dentro do mesmo bloco; evitar sequências artificiais de quebras para estruturar toda a descrição.
- Adaptar a organização ao conteúdo, sem template obrigatório. Contexto, comportamento observado e esperado são sugestões para Bug, não seções obrigatórias. Um relato curto pode ser um único parágrafo. Não inventar informações para completar seções; manter a história de usuário de PBI quando aplicável.
- Preferir tags simples e fechadas, sem CSS inline, cores/fontes impostas ou tabelas decorativas. Enviar as tags como HTML, sem cercas de código ou escape do markup (`&lt;p&gt;`). Escapar apenas caracteres especiais do texto quando necessário; não aplicar duplo escape a HTML válido.
- Conferir blocos/listas nos dois campos antes da preparação e o HTML no diff. Na edição, preservar HTML existente e campos não solicitados; melhorias de formatação integram a proposta aprovada.

O servidor **preserva o conteúdo recebido**, sem converter Markdown para HTML ou aplicar um layout automaticamente. Os testes verificam tags/listas e entidades preservadas no diff, POST e PATCH; a renderização e a sanitização finais continuam sob responsabilidade do TFS. Não há garantia de reprodução exata do layout de um print.

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

## Bugs

### Descoberta antes da proposta

1. Pesquisar títulos com `tfs_search_work_items` usando palavras do sistema e variações do nome. Consultar detalhes com `tfs_get_work_item` e preservar o prefixo real entre colchetes, incluindo abreviações e pontuação; por exemplo, `[TRIAGEM INT. E CIR.]`. Se não encontrar exemplos, declarar isso e propor um novo prefixo para aprovação. Sistema desconhecido ou padrões concorrentes exigem esclarecimento.
2. Consultar `tfs_list_classifications` para `areas` e `iterations`, aumentando `depth` se necessário, e selecionar caminhos completos existentes. Área/iteração do pai ou de itens semelhantes são candidatos, não prova de localização correta. Não escolher sprint pela data nem copiar automaticamente uma iteração antiga.
3. Pesquisar Features do sistema/assunto, ler as candidatas e sua ancestralidade até Epic. A hierarquia é **Epic → Feature → PBI ou Bug → Task**: PBI e Bug são irmãos. Novo Bug exige `parentId` de Feature, `areaPath` e `iterationPath`; a preparação bloqueia sua ausência e verifica o tipo do pai. A existência/adequação dos caminhos é obtida pelas leituras do agente, não inferida pelo servidor a partir do título.
4. Mostrar pai (ID, tipo e título), área, iteração e evidências breves. Se não houver candidato adequado ou houver ambiguidade, perguntar ao usuário; não inventar IDs/caminhos nem criar pais silenciosamente. A busca de títulos é por `CONTAINS`, não busca no corpo da descrição, e pode exigir variações e paginação.

### Conteúdo e estimativas

- Título: `[Sistema] <descrição objetiva>`. Exemplo: `[AIH] Corrigir envio dos dias de UTI e identificação de hospital dia`.
- `description` corresponde a **Steps to Reproduce**. Descrever problema, comportamento observado e esperado quando conhecidos. Passos, ambiente e evidências somente se fornecidos; não inventar causa técnica, impacto ou solução.
- `acceptanceCriteria`: critérios curtos e verificáveis fundamentados no relato; omitir quando não houver contexto suficiente.
- `customFields.activity`: `Development` por padrão na criação de Bug; uma opção explícita/contextual prevalece. A preparação inclui o padrão no diff, mas não aplica esse default na edição nem nas Tasks.
- `size`, `complexity` e `uncertainty`: estimativas de níveis 1–3, com justificativa breve e lacunas sinalizadas. `effort` é numérico e segue a [referência completa de esforço](tfs-effort-reference.md), sem conversão para horas. Ao receber dimensões na criação, o servidor exige o trio e calcula Effort; divergência explícita é bloqueada. Na edição de dimensões, completa com os valores atuais conhecidos; não infere dimensões ausentes nem recalcula em edições não relacionadas. A orientação pede o trio na proposta; chamadas genéricas sem dimensões não recebem estimativas fabricadas pelo servidor.
- Não preencher responsável, prioridade, severidade, estado ou outros campos por suposição. Distinguir valor informado, estimativa, padrão verificado e campo não informado. `System Info` e campos sem alias confirmado não recebem reference names inventados.

### Proposta e aprovação

Apresentar uma tabela de **campo, valor proposto e origem/justificativa**, seguida dos textos da descrição e dos critérios. Incluir título, Activity, três estimativas, Effort, área, iteração, pai e campos conhecidos/não informados. Na edição, incluir também o valor atual.

Ao final, perguntar **“Confirma esta proposta ou deseja alterar algum valor? Deseja incluir a Task de Testes?”** e aguardar aprovação explícita antes da escrita. Com `MCP_REQUIRE_CONFIRMATION=false`, essa aprovação é conversacional, sem exigir `CONFIRMO` literal; é uma orientação ao agente, não uma trava adicional verificável pelo servidor. Com a confirmação técnica habilitada, `CONFIRMO` continua obrigatório.

Preparar cada plano, comparar o diff com a proposta aprovada e pedir nova aprovação se surgirem mudanças materiais. Token, preflight e aprovação independente do host continuam válidos. A configuração global das outras integrações não muda.

### Task de Testes e edição

Na criação, sugerir **somente uma Task opcional**: `Testes - <título reduzido do Bug>`, Activity `Testing`, pai igual ao ID real retornado pela criação do Bug. Aplicar as mesmas restrições de título das Tasks de PBI: somente palavras do título do pai na mesma ordem, sem acréscimos, preservando o prefixo quando usado. A descrição contém apenas validações fundamentadas no relato/critérios. O usuário pode aprovar somente o Bug ou Bug + Task. Antes de sugerir Testes para um Bug existente, ler suas relações e as Tasks filhas para evitar duplicação.

Task filha de Bug herda responsável conhecido, área e iteração quando ausentes, preservando valores explícitos e verificando a revisão do pai, como Task de PBI. São duas operações sem atomicidade: criar o Bug primeiro, depois preparar a Task com o ID real. Se a Task falhar, informar o sucesso do Bug e a falha separadamente.

Ao editar, preservar campos não solicitados. Sugerir adequação ao padrão somente quando solicitada ou necessária, com motivo e antes/depois para aprovação. Mudança de dimensão exige apresentar também Effort recalculado. Pai ausente/incompatível deve ser sinalizado e ter correção proposta, não migrado silenciosamente; edições não relacionadas preservam relações legadas. A remoção explícita do pai (`parentId: null`) de um Bug é bloqueada; a troca exige outra Feature real. Não criar Task automaticamente nem aplicar defaults de criação ao item existente.

## Tasks de PBI

Quando o usuário pedir Tasks para um PBI sem definir quantidade ou categorias, a orientação MCP sugere quatro Tasks filhas: Desenvolvimento, Documentação, Comunicação e Testes. Os títulos seguem `<Categoria em português> - <título reduzido do PBI>`: o trecho após o hífen deve ter no máximo o tamanho do título do PBI, usando apenas palavras do próprio título, na mesma ordem, sem introduzir preposições. Por exemplo, para `Fluxo Agendamento Cirurgia`, use `Comunicação - Fluxo Agendamento Cirurgia` ou uma versão mais curta; não use `Fluxo de Agendamento de Cirurgia`. Não derive o título do conteúdo/descrição do PBI. Cada item usa `type: Task`, `parentId` igual ao ID do PBI e `customFields.activity` com o valor Activity correspondente (`Development`, `Documentation`, `Communication` ou `Testing`). Se o usuário especificar outro recorte, prevalece o pedido explícito.

Na preparação de uma nova Task filha de PBI, se não forem informados, `assignedTo`, `areaPath` e `iterationPath` são herdados dos valores existentes no pai. Valores explícitos, inclusive `null`, são preservados. Para responsáveis retornados como identidade, a herança usa `uniqueName` quando disponível e não atribui um usuário por suposição. Os valores herdados constam do diff; caso a revisão do PBI mude antes da aplicação, o plano é bloqueado para permitir nova preparação. Não há herança automática ao editar Tasks existentes. Tasks filhas de Bug seguem a mesma herança na criação, conforme a seção Bugs. A descrição breve de cada Task deve indicar o trabalho a fazer somente se os dados do PBI fundamentarem esse texto; se não houver contexto, é melhor deixá-la vazia do que inventar etapas.

| Campo visível na Task | Alias MCP | Reference name / validação |
| --- | --- | --- |
| Activity | `customFields.activity` | `Microsoft.VSTS.Common.Activity`; permitido em Bug e Task, com opções `Communication`, `Deployment`, `Design`, `Development`, `Documentation`, `Requirements`, `Testing` |
| Remaining Work | `customFields.remainingWork` | `Microsoft.VSTS.Scheduling.RemainingWork`; limitado a Task e exige número |
| Blocked | `customFields.blocked` | `Microsoft.VSTS.CMMI.Blocked`; limitado a Task e exige boolean |
| Priority | `customFields.priority` | `Microsoft.VSTS.Common.Priority`; mapeado também em PBI |
| Description, Title, State, Assigned To e relação Parent | campos genéricos | disponíveis na criação/edição; `parentId` é validado contra a hierarquia autorizada |

Os campos Activity, Remaining Work e Blocked são lidos em `customFields` ao consultar/listar Tasks e podem ser escritos em criação/edição. Activity também é lido/escrito em Bugs; Remaining Work e Blocked continuam exclusivos de Task. Os aliases escopados são omitidos da leitura de tipos não permitidos e bloqueados para escrita neles. A configuração usa os reference names usuais; é necessário confirmar sua associação e gravação nos WITs da instalação real. `Personas affected` está visível na tela, mas continua sem alias porque seu reference name não foi confirmado.

Criação, edição e deleção de Tasks usam as ferramentas genéricas `tfs_prepare_create_work_item`, `tfs_prepare_update_work_item` e `tfs_prepare_trash_work_item`. A deleção é envio recuperável à recycle bin (`destroy=false`). Um conjunto de quatro Tasks gera quatro planos independentes; cada um apresenta seu diff e passa por preflight e confirmação antes da escrita, sem garantia de transação atômica do conjunto.

## Concorrência e remoção

Edições incluem um teste de `rev` no JSON Patch e fazem preflight imediatamente antes da escrita. Remoções chamam o endpoint individual com `destroy=false`.

## Comentários

`tfs_list_work_item_comments` consulta os comentários pelo endpoint de Work Item Comments usando a API `7.0-preview.3`. A leitura aceita até 50 itens por página, `continuationToken`, ordem crescente ou decrescente e a opção `includeDeleted`.

`tfs_prepare_create_work_item_comment`, `tfs_prepare_update_work_item_comment` e `tfs_prepare_delete_work_item_comment` criam planos confirmáveis; nenhuma dessas ferramentas escreve diretamente no TFS. Alterações e deleções relêem a revisão do work item e a versão do comentário imediatamente antes da aplicação e bloqueiam conflitos. A deleção usa o `DELETE` da API de comentários, que marca o comentário como deletado e permite consultá-lo com `includeDeleted=true`.

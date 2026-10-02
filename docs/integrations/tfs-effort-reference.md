# Referência de esforço Sarah

Fonte: tabela «Mapeamento abstrato operacional» fornecida pelo usuário em 2026-10-02. A pesquisa no repositório não encontrou referencial anterior. Esta é a referência documental única para as 27 combinações.

## Correspondência com os campos do TFS

| Nível | Tamanho (`size`) | Complexidade (`complexity`) | Incerteza (`uncertainty`) |
| --- | --- | --- | --- |
| 1 | 1 - Mínimo | 1 - Baixa (Simples na tabela original) | 1 - Baixa (Baixo na tabela original) |
| 2 | 2 - Médio | 2 - Moderada | 2 - Moderada (Ambígua na tabela original) |
| 3 | 3 - Máximo | 3 - Alta (Complexa na tabela original) | 3 - Alta (Alto na tabela original) |

O cabeçalho «Esforço» da imagem corresponde ao **Tamanho**; «Pontuação» corresponde ao **Effort** do work item. Não confundir pontuação com horas: as colunas de tempo/equipe da imagem não definem conversão e não devem ser usadas para inventar duração ou responsável.

## Matriz completa

As três primeiras colunas abaixo usam os códigos dos campos Sarah.

| Tamanho | Complexidade | Incerteza | Effort |
| --- | --- | --- | --- |
| 1 | 1 | 1 | 1 |
| 1 | 1 | 2 | 2 |
| 1 | 1 | 3 | 5 |
| 1 | 2 | 1 | 2 |
| 1 | 2 | 2 | 5 |
| 1 | 2 | 3 | 8 |
| 1 | 3 | 1 | 5 |
| 1 | 3 | 2 | 8 |
| 1 | 3 | 3 | 20 |
| 2 | 1 | 1 | 3 |
| 2 | 1 | 2 | 8 |
| 2 | 1 | 3 | 8 |
| 2 | 2 | 1 | 8 |
| 2 | 2 | 2 | 13 |
| 2 | 2 | 3 | 20 |
| 2 | 3 | 1 | 13 |
| 2 | 3 | 2 | 20 |
| 2 | 3 | 3 | 20 |
| 3 | 1 | 1 | 8 |
| 3 | 1 | 2 | 13 |
| 3 | 1 | 3 | 20 |
| 3 | 2 | 1 | 13 |
| 3 | 2 | 2 | 20 |
| 3 | 2 | 3 | 20 |
| 3 | 3 | 1 | 20 |
| 3 | 3 | 2 | 20 |
| 3 | 3 | 3 | 20 |

## Uso na proposta de Bug

- Estimar cada dimensão com justificativa breve e distinguir estimativa de fato. Tamanho representa o volume de trabalho; Complexidade, a dificuldade técnica; Incerteza, as lacunas e dúvidas conhecidas. Pouca informação não é evidência de baixa incerteza.
- Selecionar Effort pela combinação exata, não por soma, produto, arredondamento ou progressão presumida. As combinações 2/1/3 e 1/3/3 são, respectivamente, 8 e 20, conforme o anexo.
- Mostrar os três níveis e a pontuação ao usuário antes de pedir aprovação. Se não houver contexto suficiente para uma estimativa responsável, explicitar as lacunas e perguntar.
- Na edição, usar os valores atuais das dimensões não alteradas e propor também a pontuação recalculada. Não recalcular campos em edições não relacionadas.
- O MCP inclui a matriz nas descrições das ferramentas; o agente não depende de acesso a este arquivo. A preparação calcula Effort quando recebe uma ou mais dimensões de Bug (completando com as atuais na edição); faltas e divergências explícitas são bloqueadas. Não há inferência automática das dimensões pelo servidor.
- As regras de localização, conteúdo e aprovação estão na [integração TFS](tfs.md#bugs).
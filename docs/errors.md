# Erros estáveis

| Código | Significado | Ação recomendada |
| --- | --- | --- |
| `CONFIG_MISSING` | Configuração obrigatória ausente. | Corrigir ambiente e reiniciar. |
| `AMBIGUOUS_REQUEST` | O pedido não identifica uma opção necessária, como a wiki WordPress. | Informar o parâmetro solicitado e escolher uma das opções retornadas. |
| `AUTH_FAILED` | Credencial rejeitada. | Validar/rotacionar credencial. |
| `FORBIDDEN` | Credencial ou token sem permissão. | Revisar acesso; não ampliar automaticamente. |
| `NOT_FOUND` | Recurso ou plano inexistente. | Confirmar ID e escopo. |
| `CONFLICT` | Recurso mudou ou plano já foi usado. | Ler novamente e preparar outro plano. |
| `RATE_LIMITED` | Limite temporário do serviço. | Aguardar antes de nova leitura. |
| `POLICY_DENIED` | Operação fora da política. | Ajustar intenção ou política versionada. |
| `UPSTREAM_UNAVAILABLE` | Serviço, rede ou resposta indisponível. | Consultar estado antes de repetir escrita. |
| `OPERATION_EXPIRED` | Plano excedeu seu TTL. | Preparar novamente. |

Respostas MCP de erro usam `isError: true`, texto curto e objeto estruturado com `code` e `message`.

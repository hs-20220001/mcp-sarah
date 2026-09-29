# Riscos e limitações

- Não registrar objetos de erro HTTP sem redação; eles podem conter cabeçalhos e corpos sensíveis.
- O PAT TFS e a Application Password WordPress devem existir somente no ambiente local.
- IDs e nomes de campos customizados variam entre processos TFS; somente aliases permitidos podem ser escritos.
- A política local não confirma disponibilidade, permissões ou allowed values remotos de campos TFS; `Personas affected` e `Mapped on SpecMap` continuam sem aliases porque seus reference names não foram verificados.
- Um conjunto de quatro Tasks é preparado como quatro operações independentes, sem atomicidade do lote; `Personas affected` em Task também segue sem alias até confirmação do reference name remoto.
- Área, iteração, estado, raiz de página e categoria devem vir da API ou de política explícita.
- Com allowlists WordPress vazias, a credencial pode alcançar todo conteúdo permitido pela API e uploads podem ler qualquer imagem/PDF acessível ao processo.
- Mídias precisam ser novamente verificadas por tipo real, tamanho e hash, mesmo quando o caminho local está irrestrito.
- Algumas instalações WordPress não suportam lixeira para mídia; nesse caso a operação deve falhar fechada.
- Reiniciar o servidor invalida todos os planos e snapshots em memória.
- Deleção de comentário TFS é uma mutação recuperável da API de comentários; alterações e deleções precisam comparar a versão do comentário no preflight.
- Com `MCP_REQUIRE_CONFIRMATION=false`, planos preparados podem ser aplicados sem pausa humana; o token, o preflight e a aprovação independente do host MCP continuam sendo necessários.
- Se as URLs `WP_USER_BASE_URL` e `WP_DEVELOPER_BASE_URL` forem iguais, a seleção diferencia o perfil e sua política, mas não cria ambientes WordPress separados; a separação remota depende de URLs ou escopos realmente distintos.

# Segurança

## Segredos

- Manter credenciais apenas em `.env` local ou no ambiente do host MCP.
- Usar uma credencial por integração e o menor privilégio possível.
- Nunca registrar headers, PAT ou Application Password.
- Rotacionar a credencial quando houver suspeita de exposição.

## Escritas

- Por padrão, toda escrita exige plano, diff, token curto e `CONFIRMO`. Com `MCP_REQUIRE_CONFIRMATION=false`, somente a confirmação humana literal é dispensada: o plano, o token, o preflight, a escrita única e a auditoria continuam obrigatórios.
- Use essa opção somente em ambiente local confiável, porque qualquer plano preparado poderá ser aplicado sem uma pausa para revisão humana.
- Essa variável não altera uma aprovação adicional feita pelo host MCP, como `default_tools_approval_mode`.
- Criação/edição de Bug e sua Task de Testes orientam o agente a aguardar aprovação conversacional da proposta mesmo com `MCP_REQUIRE_CONFIRMATION=false`, sem exigir a palavra literal `CONFIRMO`. Essa orientação não constitui uma nova trava técnica: o servidor não verifica a fala do usuário e um plano ainda pode ser aplicado pelo chamador com token válido. Demais fluxos mantêm o modo global configurado.
- A aplicação relê o recurso e bloqueia conflitos.
- Escritas não recebem retry automático.
- TFS usa somente recycle bin; WordPress usa somente `force=false`.
- Se o WordPress não oferecer lixeira para mídia, a operação falha.

## Escopo

- Campos TFS customizados precisam estar no perfil YAML.
- Listas vazias de páginas, categorias e diretórios de mídia significam acesso irrestrito ao escopo correspondente.
- Quando configuradas, páginas WordPress precisam pertencer às raízes autorizadas e posts às categorias autorizadas.
- Quando configuradas, raízes de mídia limitam os diretórios; MIME type e tamanho são sempre validados.
- Mídias existentes precisam estar associadas a conteúdo autorizado.
- Escritas em menus podem ser restringidas por `allowedMenuIds` por wiki; a inclusão exige página publicada dentro do escopo e item pai existente no mesmo menu. A leitura de menus/itens ainda depende das permissões da credencial WordPress.
- A ausência de `modified_gmt` nos itens do menu exige comparação do snapshot completo no preflight; criação de página e inclusão em menu não são atômicas.

O modo irrestrito melhora o primeiro uso, mas amplia o impacto possível da credencial WordPress. Use uma conta dedicada com o menor privilégio aceitável e configure allowlists quando quiser limitar o agente.

## Painel local

O painel de desenvolvimento escuta somente em `127.0.0.1`, não mostra credenciais e não oferece execução de ferramentas de escrita. O probe manual testa apenas autenticação e leitura.

## Auditoria

O JSONL opcional registra somente operação, módulo, ação, alvo, horário e estado. Descrições completas, HTML, tokens e headers não são persistidos.

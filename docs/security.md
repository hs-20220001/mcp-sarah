# Segurança

## Segredos

- Manter credenciais apenas em `.env` local ou no ambiente do host MCP.
- Usar uma credencial por integração e o menor privilégio possível.
- Nunca registrar headers, PAT ou Application Password.
- Rotacionar a credencial quando houver suspeita de exposição.
- Credenciais Oracle devem ser variáveis locais por ambiente (`DEV`, `HOM`, `PRO`); usuário alternativo na ferramenta reutiliza a senha do mesmo ambiente.

## Escritas

- Por padrão, toda escrita exige plano, diff, token curto e `CONFIRMO`. Com `MCP_REQUIRE_CONFIRMATION=false`, somente a confirmação humana literal é dispensada: o plano, o token, o preflight, a escrita única e a auditoria continuam obrigatórios.
- Use essa opção somente em ambiente local confiável. Na ausência de uma política específica do módulo, o token permite aplicar o plano sem nova pausa humana.
- Essa variável não altera uma aprovação adicional feita pelo host MCP, como `default_tools_approval_mode`.
- Criação/edição de Bug e sua Task de Testes orientam o agente a aguardar aprovação conversacional da proposta mesmo com `MCP_REQUIRE_CONFIRMATION=false`, sem exigir a palavra literal `CONFIRMO`. Para esses itens do TFS a aprovação conversacional não constitui uma nova trava técnica.
- No Kanboard pessoal o host deve mostrar o nome (quando disponível), login, alvo, ação e texto exato e aguardar autorização explícita. Além do token, a aplicação exige que `kanboardApproval` corresponda ao login, tarefa, campo e valor guardados no plano. O servidor pode verificar esses valores e a identidade via `getMe`, não a fala humana; mantenha a aprovação de escritas no host. O preflight relê a tarefa, mas a API Kanboard não oferece comparação atômica de revisão na escrita. Não repetir uma escrita de resultado ambíguo.
- A aplicação relê o recurso e bloqueia conflitos.
- Escritas não recebem retry automático.
- TFS usa somente recycle bin; WordPress usa somente `force=false`.
- Se o WordPress não oferecer lixeira para mídia, a operação falha.

## Escopo

- Kanboard: `jsonrpc` tem acesso global fora do MCP; **no MCP só pode ler**. Para conta pessoal a única preparação aceita adicionar um comentário ou editar título/descrição. Não há RPC genérico, sincronização, fechamento, exclusão nem atribuição. O login é verificado no preparo e no preflight; o autor do comentário vem da identidade verificada. Não seguir redirecionamentos nem expor o perfil bruto de `getMe`, tokens de projeto, conteúdo clínico desnecessário ou erros JSON-RPC brutos.
- HTTPS é o padrão. `KANBOARD_ALLOWED_HTTP_URL` permite HTTP apenas para o endpoint exato configurado, sem aplicar a exceção a outras integrações. Isso não protege o tráfego: quem puder observá-lo na rede poderá ler a chave Basic e os dados e reutilizar a chave fora do MCP. Prefira TLS ou túnel criptografado.
- Campos TFS customizados precisam estar no perfil YAML.
- Listas vazias de páginas, categorias e diretórios de mídia significam acesso irrestrito ao escopo correspondente.
- Quando configuradas, páginas WordPress precisam pertencer às raízes autorizadas e posts às categorias autorizadas.
- Quando configuradas, raízes de mídia limitam os diretórios; MIME type e tamanho são sempre validados.
- Mídias existentes precisam estar associadas a conteúdo autorizado.
- Escritas em menus podem ser restringidas por `allowedMenuIds` por wiki; a inclusão exige página publicada dentro do escopo e item pai existente no mesmo menu. A leitura de menus/itens ainda depende das permissões da credencial WordPress.
- A ausência de `modified_gmt` nos itens do menu exige comparação do snapshot completo no preflight; criação de página e inclusão em menu não são atômicas.

O modo irrestrito melhora o primeiro uso, mas amplia o impacto possível da credencial WordPress. Use uma conta dedicada com o menor privilégio aceitável e configure allowlists quando quiser limitar o agente.

## Oracle

- O módulo só oferece leituras: `SELECT`, metadados e chamada de função de package. Toda conexão inicia `SET TRANSACTION READ ONLY`, executa uma única ação e fecha sem retry automático.
- Use contas Oracle dedicadas com menor privilégio: leitura apenas dos schemas necessários e `EXECUTE` somente em packages/functions aprovados como seguros. Nunca conceda papéis amplos ao usuário do MCP. Allowlist vazia em `ORACLE_READONLY_FUNCTIONS_<AMBIENTE>` permite chamar qualquer função compatível autorizada no Oracle; uma allowlist preenchida restringe aos nomes exatos `OWNER.PACKAGE.FUNCTION`.
- Uma função chamada por `SELECT` pode ter efeitos autônomos ou externos que não são bloqueados pela transação READ ONLY. A ferramenta não consegue provar ausência desses efeitos; o DBA deve auditar os packages permitidos.
- Os valores SQL devem ser fornecidos por binds; identificadores de schema, tabela, package e função aceitam somente identificadores simples e são consultados em metadados visíveis ao usuário.
- DEV é o padrão e não há fallback automático para HOM/PRO. Não exponha resultados sensíveis além do necessário.

## Painel local

O painel de desenvolvimento escuta somente em `127.0.0.1`, não mostra credenciais e não oferece execução de ferramentas de escrita. O probe manual testa apenas autenticação e leitura.

## Auditoria

O JSONL opcional registra somente operação, módulo, ação, alvo, horário e estado. Descrições completas, HTML, tokens e headers não são persistidos.

# Integração WordPress

## Contrato

- REST API `/wp-json/wp/v2`.
- Application Password via Basic Auth sobre HTTPS.
- Contexto `edit` para preservar HTML bruto e metadados editáveis.
- Suporte a páginas, posts, mídias e menus clássicos de Aparência → Menus (`/menus` e `/menu-items`).

## Navegação lateral e páginas

`parentId` e `menuOrder` da página alteram a árvore das páginas, **não** o menu de navegação. Use `wordpress_list_menus` para descobrir os menus da wiki e `wordpress_list_menu_items` para consultar a hierarquia de um menu. A ferramenta de sugestão lista os menus (até 200) e busca todos os itens **somente** no candidato (até 2000): evita carregar todas as árvores a cada criação. Na wiki `developer`, quando o pedido se refere claramente a um sistema, procura o menu real chamado “Software e desenvolvimento” e seu item raiz homônimo; na wiki `user`, usa o nome do sistema informado para localizar um menu com esse nome. Havendo página-pai já no menu, sugere seu item; sem correspondência única, não inventa posição e solicita menu e item pai ao usuário. A sugestão não escreve nada.

Fluxo para novas páginas: sugerir posição → usuário confirmar a proposta → preparar/criar a página (padrão `draft`) → publicar, se apropriado → preparar/adicionar um item de página ao menu confirmado → aplicar o plano. **Criação da página e inclusão no menu são duas escritas remotas independentes** (dois planos/diffs/tokens e, no modo padrão, duas confirmações), não uma transação. Se a página ficar em rascunho, o menu for ambíguo, a política/permissão bloquear ou a inclusão falhar, comunique na resposta final: a página foi criada mas **não** foi adicionada ao menu, o motivo e o pedido de menu/posição para uma nova solicitação. Não repita automaticamente uma escrita de resultado incerto.

Itens de menu existentes podem mudar de item pai, ordem ou rótulo no **mesmo** menu; não há transferência entre menus, criação/remoção de menu ou exclusão de item. Somente páginas autorizadas podem ser incluídas e editadas; um pai tem de existir no mesmo menu, e reposicionamento em ciclo é bloqueado. `allowedMenuIds` limita menus de escrita por perfil; vazio significa todos. A API WordPress não oferece `modified_gmt` de menu/item: o preflight compara o nome do menu e o snapshot completo dos seus itens antes da escrita, mas alterações ocorridas entre esse preflight e o POST não são atomicamente impedidas pela API.

## Wikis

O módulo pode usar dois perfis com a mesma credencial: `user` para a wiki pública dos usuários e `developer` para a wiki da informática. Cada perfil possui sua própria URL e pode possuir uma política WordPress específica. Quando os dois estão configurados, as ferramentas exigem o campo `wiki`; um pedido sem essa escolha falha com `AMBIGUOUS_REQUEST` antes de fazer chamada remota.

Se as duas URLs forem iguais, a seleção ainda separa as políticas e o contexto lógico, mas não cria dois ambientes WordPress: o destino HTTP é a mesma instalação. Para separar realmente os conteúdos, use URLs diferentes ou políticas/raízes/categorias distintas nessa instalação.

## Escopo

Páginas são autorizadas pela ancestralidade até `allowedPageRootIds`. Posts são autorizados pela interseção com `allowedPostCategoryIds`. Uma lista vazia permite todo o escopo correspondente; uma lista preenchida funciona como allowlist restritiva.

Uploads exigem conteúdo associado autorizado. Quando `WP_ALLOWED_MEDIA_ROOTS` contém caminhos, o arquivo precisa estar dentro de uma dessas raízes; quando está vazio, qualquer caminho local legível é aceito. O caminho real, tamanho, assinatura binária/MIME e SHA-256 são validados novamente na aplicação. Arquivo e metadados são enviados juntos em uma única requisição multipart.

## Concorrência e remoção

Edições e lixeira comparam `modified_gmt`. O módulo nunca envia `force=true`. Como instalações WordPress podem não oferecer lixeira de anexos, mídia falha com `POLICY_DENIED` em vez de tentar exclusão permanente.

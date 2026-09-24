# Integração WordPress

## Contrato

- REST API `/wp-json/wp/v2`.
- Application Password via Basic Auth sobre HTTPS.
- Contexto `edit` para preservar HTML bruto e metadados editáveis.
- Suporte inicial a páginas, posts e mídias.

## Wikis

O módulo pode usar dois perfis com a mesma credencial: `user` para a wiki pública dos usuários e `developer` para a wiki da informática. Cada perfil possui sua própria URL e pode possuir uma política WordPress específica. Quando os dois estão configurados, as ferramentas exigem o campo `wiki`; um pedido sem essa escolha falha com `AMBIGUOUS_REQUEST` antes de fazer chamada remota.

Se as duas URLs forem iguais, a seleção ainda separa as políticas e o contexto lógico, mas não cria dois ambientes WordPress: o destino HTTP é a mesma instalação. Para separar realmente os conteúdos, use URLs diferentes ou políticas/raízes/categorias distintas nessa instalação.

## Escopo

Páginas são autorizadas pela ancestralidade até `allowedPageRootIds`. Posts são autorizados pela interseção com `allowedPostCategoryIds`. Uma lista vazia permite todo o escopo correspondente; uma lista preenchida funciona como allowlist restritiva.

Uploads exigem conteúdo associado autorizado. Quando `WP_ALLOWED_MEDIA_ROOTS` contém caminhos, o arquivo precisa estar dentro de uma dessas raízes; quando está vazio, qualquer caminho local legível é aceito. O caminho real, tamanho, assinatura binária/MIME e SHA-256 são validados novamente na aplicação. Arquivo e metadados são enviados juntos em uma única requisição multipart.

## Concorrência e remoção

Edições e lixeira comparam `modified_gmt`. O módulo nunca envia `force=true`. Como instalações WordPress podem não oferecer lixeira de anexos, mídia falha com `POLICY_DENIED` em vez de tentar exclusão permanente.

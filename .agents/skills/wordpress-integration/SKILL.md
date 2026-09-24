---
name: wordpress-integration
description: Alterar com segurança a integração WordPress REST para páginas, posts e mídias, incluindo Application Password, conteúdo raw, raízes e categorias autorizadas, uploads, modified_gmt e lixeira. Usar em mudanças no módulo WordPress, sua política, contratos ou testes.
---

# Integração WordPress

1. Leia `docs/integrations/wordpress.md` e `config/wordpress.yaml`.
2. Solicite contexto `edit` para obter conteúdo bruto e revisões úteis.
3. Trate listas vazias de páginas, categorias ou raízes de mídia como escopo irrestrito; quando preenchidas, aplique-as como allowlists estritas.
4. Em upload, valide caminho real, MIME, tamanho e SHA-256 antes e depois da confirmação.
5. Em edições e lixeira, releia e compare `modified_gmt`.
6. Use `force=false`; se mídia não tiver lixeira, falhe com segurança.
7. Não grave HTML integral em logs ou auditoria e cubra os contratos com `fetch` simulado.

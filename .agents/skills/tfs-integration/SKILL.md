---
name: tfs-integration
description: Alterar com segurança a integração TFS/Azure DevOps Server, incluindo PAT, REST 7.0, WIQL, work items, queries, classificações, campos Sarah, hierarquia, revisões e recycle bin. Usar em mudanças no módulo TFS, sua política YAML, contratos ou testes.
---

# Integração TFS

1. Leia `docs/integrations/tfs.md` e `config/tfs-sarah.yaml`.
2. Nunca aceite WIQL arbitrário; construa consultas apenas com filtros validados.
3. Limite páginas a 50 itens e lotes a 200 IDs.
4. Consulte áreas e iterações reais e use apenas tipos, hierarquia e aliases permitidos.
5. Em edições e lixeira, releia e compare `rev` antes de aplicar.
6. Use `destroy=false` em remoções e nunca repita uma escrita após erro de rede ambíguo.
7. Cubra URL, autenticação, JSON Patch, conflitos e lixeira com `fetch` simulado.

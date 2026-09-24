---
id: wordpress-multiple-wikis
status: concluded
created: 2026-09-24
updated: 2026-09-24
---

# Duas wikis WordPress

## Objetivo

Permitir que o módulo WordPress acesse uma wiki pública dos usuários e uma wiki da informática com a mesma credencial, identificando o destino de forma explícita quando os dois perfis estiverem configurados.

## Escopo

- Aceitar URL separada para cada wiki e manter `WP_BASE_URL` como compatibilidade para uma única wiki.
- Permitir política WordPress separada por wiki, com fallback para a política existente.
- Adicionar o destino `user` ou `developer` às ferramentas WordPress.
- Retornar uma solicitação clara de escolha quando os dois perfis estiverem configurados e o pedido não indicar a wiki.
- Mostrar no status somente nomes e URLs dos perfis, sem credenciais.
- Documentar que URLs iguais continuam sendo uma única origem remota; a separação de conteúdo exige escopo WordPress distinto.

## Fora de escopo

- Descobrir automaticamente qual wiki o usuário quis dizer pelo texto livre do agente.
- Separar usuários, Application Passwords ou raízes locais de mídia por wiki.
- Alterar conteúdo remoto real durante testes.

## Critérios de aceite

- [x] Uma configuração legada com `WP_BASE_URL` continua carregando e as ferramentas continuam operacionais.
- [x] Duas URLs HTTPS carregam como perfis `user` e `developer` com credenciais compartilhadas.
- [x] Ferramentas WordPress encaminham cada operação ao cliente e à política da wiki escolhida.
- [x] Sem `wiki` em uma configuração ambígua, a resposta informa as opções válidas sem fazer chamada remota.
- [x] O status identifica perfis configurados sem expor segredos.
- [x] Typecheck, lint, suíte completa, cobertura, build e validação do workflow passam.

## Riscos

- Se as duas URLs forem iguais, selecionar um perfil não muda o destino HTTP; políticas distintas são necessárias para separar árvores/categorias no mesmo WordPress.
- Manter `WP_BASE_URL` como fallback pode mascarar uma configuração incompleta se o operador acreditar que já cadastrou dois ambientes; o status deve deixar os perfis visíveis.

## Evidências

- Leitura pública em 2026-09-24 retornou `200` para `https://docssih.sarah.br/` e `https://docssih.sarah.br/wp-json/`; as duas URLs fornecidas pelo usuário são iguais.
- `npm run typecheck`: aprovado.
- `npm run lint`: aprovado.
- `npm test`: 11 arquivos e 45 testes aprovados.
- `npm run test:coverage`: aprovado, cobertura global de linhas de 60,28%.
- `npm run build`: aprovado.
- `npm run validate:workflow`: aprovado.
---
id: tfs-pbi-tasks
status: concluded
created: 2026-09-29
updated: 2026-09-29
---

# Tasks padrão para PBI no TFS

## Objetivo

Orientar a decomposição de PBIs em Tasks consistentes e garantir acesso aos campos da Task apresentados pelo usuário.

## Escopo

- Quando a solicitação de Tasks para um PBI não especificar categorias/quantidade, recomendar quatro Tasks: Desenvolvimento, Documentação, Comunicação e Testes.
- Padronizar títulos como `<Categoria> - <resumo curto do título do PBI>`, relacionar cada Task ao PBI pai e preencher Activity com o valor permitido correspondente.
- Configurar Activity com todas as opções vistas na interface e expor Remaining Work e Blocked para leitura/escrita de Tasks.
- Deixar claro que criação, edição e envio à lixeira são suportados pelas ferramentas existentes; cada escrita remota permanece uma operação separada, com preflight e confirmação padrão.
- Documentar campos sem identificador remoto verificado e cobrir as chamadas simuladas.

## Fora de escopo

- Criar automaticamente um conjunto de Tasks sem pedido de criação do usuário.
- Criar categorias extras quando a solicitação não as pedir.
- Inferir reference names para Personas affected sem consultar metadados TFS.
- Escrever diretamente no TFS fora do fluxo de operações confirmáveis.

## Critérios de aceite

- [x] Orientação MCP ensina o padrão de quatro Tasks, seus títulos em português, Activity e relação com o PBI.
- [x] `activity` aceita somente as sete opções mostradas e é limitada a Task.
- [x] `remainingWork` e `blocked` têm aliases de leitura/escrita limitados a Task e validam os tipos dos valores.
- [x] Ferramentas existentes permitem preparar criação, edição e remoção recuperável de Tasks.
- [x] Campos sem reference name verificável são documentados sem suposições.
- [x] Typecheck, lint, testes, cobertura, build e validação do workflow passam.

## Riscos

- Os metadados reais do processo podem variar; a configuração não comprova que Activity, Remaining Work ou Blocked estejam disponíveis/gravam no WIT Task dessa instalação.
- Personas affected aparece na interface, mas seu reference name não foi fornecido nem verificado.
- Uma Task por plano preserva diff e preflight por escrita, mas um conjunto de quatro preparações não é uma transação atômica.

## Evidências

- Auditoria das ferramentas genéricas do TFS confirmou suporte existente a create, update e recycle bin, além da relação Task→PBI permitida na política.
- `npm run typecheck`, `npm run lint`, `npm test` (11 arquivos, 53 testes), `npm run test:coverage` (70,80% linhas), `npm run build` e `npm run validate:workflow`: aprovados.
- Contratos simulados MCP e cliente TFS validam Activity e campos Task, relação com PBI e ciclo protegido de criação, edição e lixeira.
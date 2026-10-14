# Arquitetura

## Visão geral

`src/server.ts` é o composition root. Ele cria o núcleo, instancia o registro estático de módulos e devolve um `McpServer` sem assumir o transporte. `src/index.ts` conecta essa fábrica ao `stdio`; um transporte HTTP futuro poderá reutilizar a mesma fábrica.

## Camadas

1. **Núcleo:** configuração, erros, cliente HTTP, logger, snapshots e operações confirmáveis.
2. **Módulos:** TFS, WordPress e Oracle possuem clientes e ferramentas próprios. Oracle não possui ferramentas de escrita.
3. **Transporte:** apenas `stdio` para o protocolo MCP nesta fase.
4. **Painel de desenvolvimento:** HTTP somente em loopback, para status, catálogo e orientação; não é um transporte MCP e não executa mutações.

Cada módulo implementa:

```ts
interface IntegrationModule {
  readonly id: 'tfs' | 'wordpress'
  initialize(): Promise<void>
  registerTools(server: McpServer): void
  healthCheck(probe: boolean): Promise<ModuleHealth>
}
```

O registro é intencionalmente estático e todos os módulos desenvolvidos são publicados automaticamente. Isso mantém dependências e ferramentas visíveis no código, sem carregamento dinâmico arbitrário. Credenciais ausentes tornam somente a integração correspondente indisponível.

`scripts/dev.ts` inicia o servidor `stdio` e o painel local. O painel consulta uma instância MCP separada em memória para que status, schemas e descrições venham do contrato real, sem duplicar o catálogo na interface.

## Operações confirmáveis

Ferramentas de preparação capturam o estado atual, validam a política e guardam em memória uma função de preflight e uma função de execução. O token retornado ao cliente é armazenado apenas como SHA-256. Por padrão, `operations_apply` também exige a confirmação literal `CONFIRMO`; `MCP_REQUIRE_CONFIRMATION=false` desativa somente essa pausa humana e mantém as demais proteções.

Na aplicação, o núcleo:

1. valida expiração, estado e token;
2. muda atomicamente o plano para `applying`;
3. executa o preflight contra o estado remoto atual;
4. realiza uma única escrita;
5. registra resultado ou falha sem repetir a mutação.

Cada plano representa uma única mutação remota. Reiniciar o processo descarta planos pendentes.

O cliente Oracle abre uma conexão por chamada e inicia uma transação `READ ONLY`; não repete operações e fecha a conexão ao concluir. O módulo suporta consulta `SELECT`, metadados de tabelas e funções escalares de packages.

## Dados e limites

- Snapshots TFS expiram em 10 minutos e guardam somente IDs.
- Páginas MCP retornam no máximo 50 itens.
- O TFS é consultado em lotes de até 200 IDs.
- Resultados incluem texto curto e `structuredContent`.
- O núcleo não possui chave nem cliente OpenAI; o modelo pertence ao host MCP.

# Passo a passo para iniciantes

## 1. Abra o terminal na pasta do projeto

```powershell
cd E:\localdev\mcp-sarah
```

## 2. Instale as dependências

Faça isso na primeira instalação ou depois de mudanças no `package.json`:

```powershell
npm install
```

## 3. Configure as credenciais

Se ainda não existir um `.env`:

```powershell
Copy-Item .env.example .env
```

Abra `.env` em um editor e preencha TFS e WordPress. Não envie esse arquivo para ninguém e não o adicione ao Git.

## 4. Abra o painel de orientação

```powershell
npm run dev
```

O navegador abrirá `http://127.0.0.1:3333`. Deixe o terminal aberto enquanto usa o painel. Clique em **Testar conexões agora** para conferir TFS e WordPress sem realizar escritas. Pressione `Ctrl+C` no terminal quando terminar.

Esse comando é útil para orientação e desenvolvimento, mas não precisa permanecer aberto para o Codex funcionar.

## 5. Gere a versão usada pelo Codex

```powershell
npm run build
```

O arquivo principal será criado em `dist/index.js`.

## 6. Configure o Codex

Copie o bloco de `.codex/config.toml.example` para o arquivo `~/.codex/config.toml`. Confirme que `cwd` aponta para `E:\localdev\mcp-sarah`, salve e reinicie o Codex.

O Codex inicia o MCP automaticamente quando precisar. Não execute `npm run dev` para conectá-lo.

## 7. Confirme a conexão no Codex

Abra `/mcp` e verifique se `mcp_sarah` aparece. Depois peça:

> Consulte o status do MCP Sarah e teste as conexões.

## 8. Faça consultas antes de escrever

Exemplos:

- “Liste as áreas do TFS.”
- “Busque work items com a palavra cadastro.”
- “Procure páginas WordPress sobre centro cirúrgico.”
- “Liste as mídias WordPress relacionadas a manual.”

## 9. Teste uma escrita segura

Escolha primeiro um item ou conteúdo de teste. A IA deve preparar a operação e mostrar o diff. Revise com atenção e responda `CONFIRMO` somente se o alvo e as alterações estiverem corretos.

Para um ambiente local confiável, você pode definir `MCP_REQUIRE_CONFIRMATION=false` no `.env`. Nesse modo a resposta `CONFIRMO` não é necessária, mas o plano, o token, o preflight e uma eventual aprovação do host MCP continuam existindo.

## Comandos do dia a dia

- `npm run dev`: abre o painel local.
- `npm run build`: recompila o servidor para o Codex.
- `npm run inspector`: abre o inspetor técnico MCP.
- `npm test`: roda testes locais sem acessar TFS ou WordPress.
- `npm run test:live`: testa serviços reais somente quando `MCP_LIVE_TESTS=CONFIRMO_LEITURA` estiver definido.

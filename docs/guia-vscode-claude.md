# MCP Sarah no VS Code com Claude

Este guia considera **Windows e VS Code local**, sem WSL, container ou conexão remota. O MCP Sarah roda na sua máquina e permite consultar TFS, WordPress, Kanboard e Oracle; algumas integrações também permitem escritas controladas.

Repositório público: https://github.com/hs-20220001/mcp-sarah

**Resumo:** instale o projeto, preencha somente as integrações que deseja usar e conecte o MCP à extensão correta. Não é necessário usar Claude Desktop, manter um terminal aberto ou executar o painel auxiliar.

## 1. Identifique como você usa Claude

No VS Code, abra **Extensões** (`Ctrl+Shift+X`) e confira:

| Seu chat | Siga |
|---|---|
| Extensão **Claude Code**, da Anthropic | [Opção A — Claude Code](#opção-a--extensão-claude-code-da-anthropic) |
| Chat do **GitHub Copilot**, com Claude selecionado como modelo | [Opção B — GitHub Copilot](#opção-b--github-copilot-com-modelo-claude) |

São clientes diferentes: configurar um não configura o outro. Se usa outra extensão, confirme se ela aceita servidores MCP locais por `stdio` antes de seguir. Não configure as duas opções sem necessidade.

## 2. Pré-requisitos

### Obrigatórios

- VS Code atualizado e acesso autenticado à extensão/chat escolhido.
- **Node.js 20 ou superior**, com npm; recomenda-se **Node.js 24 LTS**, usado no desenvolvimento do projeto: https://nodejs.org/
- Git: https://git-scm.com/downloads
- Para acessar serviços internos: rede/VPN e credenciais próprias autorizadas.

### Obrigatório somente para a opção A

- CLI do Claude Code disponível no terminal. A instalação da extensão não garante que o comando `claude` esteja no PATH.
- Se faltar, siga a instalação oficial: https://code.claude.com/docs/en/setup
- No Windows nativo, confira também os requisitos de Git for Windows/Git Bash descritos nessa documentação.

### Não necessários para executar o MCP

- Conta GitHub com acesso de escrita ao repositório, GitHub CLI ou login do proprietário `hs-20220001`.
- Claude Desktop, chave OpenAI ou chave de IA dentro da configuração do MCP. O login/plano do seu cliente de IA é independente.
- Oracle Instant Client, salvo a situação avançada explicada adiante.

No **terminal PowerShell do VS Code**, confira:

```powershell
node --version
npm --version
git --version
```

Para Claude Code, confira também `claude --version`. Se algum comando não existir, instale o requisito e reabra o VS Code.

## 3. Baixe e prepare o projeto

Os exemplos usam **C:\MCP\mcp-sarah**. Execute um comando por vez e **pare se algum falhar**:

```powershell
New-Item -ItemType Directory -Force C:\MCP | Out-Null
Set-Location C:\MCP
git clone https://github.com/hs-20220001/mcp-sarah.git
Set-Location C:\MCP\mcp-sarah
npm ci
Copy-Item .env.example .env
npm run build
notepad .env
```

- Faça a cópia do modelo **somente na primeira instalação**; não sobrescreva uma configuração existente.
- Se a pasta já existe e é um clone do projeto, use a [atualização](#8-atualizar-o-mcp) em vez de clonar novamente.
- Se escolher outra pasta, ajuste também os **dois caminhos** dos comandos/configurações de conexão da seção 5.

## 4. Configure suas variáveis

Edite o arquivo local criado a partir de [.env.example](../.env.example). A documentação detalhada está em [configuration.md](configuration.md).

**Como preencher:** cada linha segue `NOME=valor`. Não coloque espaços no nome da variável. Para deixar uma variável vazia, use `NOME=`. Para valores com `#` ou espaços que precisem ser preservados, use aspas duplas, como `NOME="valor"`.

**Nenhuma integração é obrigatória para iniciar o MCP.** Para usar uma integração, preencha todos os campos obrigatórios dela. Comece por uma integração e teste antes de configurar as demais.

**Os valores do modelo são exemplos, não configurações reais.** Nas integrações não utilizadas, deixe os campos de conexão e credenciais vazios. Em especial, remova os exemplos de `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PROJECT`, `WP_BASE_URL`, `ORACLE_CONNECT_STRING_DEV` e `ORACLE_USER_DEV` se não for usar essas integrações.

### 4.1 TFS / Azure DevOps Server — integração opcional

| Variável | Obrigatoriedade ao usar TFS | O que informar |
|---|---|---|
| `AZURE_DEVOPS_ORG_URL` | **Obrigatória** | URL até a collection, sem o projeto. Exemplo: `https://tfs.exemplo.org/tfs/DefaultCollection`. |
| `AZURE_DEVOPS_PROJECT` | **Obrigatória** | Nome exato do projeto autorizado. |
| `AZURE_DEVOPS_PAT` | **Obrigatória e secreta** | Seu PAT do TFS/Azure DevOps, com acesso mínimo a Work Items/metadados; escrita somente se autorizada. Não é o token do GitHub. |
| `AZURE_DEVOPS_API_VERSION` | Opcional | Mantenha `7.0`. |

Solicite URL, collection e projeto ao responsável se não souber. A configuração não concede permissões extras: valem as permissões do titular do PAT.

### 4.2 WordPress — integração opcional

| Variável | Obrigatoriedade ao usar WordPress | O que informar |
|---|---|---|
| `WP_BASE_URL` | **Uma URL é obrigatória**; escolha conforme abaixo | URL HTTPS de uma única wiki, sem `/wp-json`. |
| `WP_USER_BASE_URL` | Alternativa à URL única | URL HTTPS da wiki dos usuários. |
| `WP_DEVELOPER_BASE_URL` | Alternativa à URL única | URL HTTPS da wiki da informática. |
| `WP_USERNAME` | **Obrigatória** | Seu login autorizado no WordPress. |
| `WP_APPLICATION_PASSWORD` | **Obrigatória e secreta** | Application Password dedicada, gerada no perfil WordPress. Não é a senha comum de login. |
| `WP_ALLOWED_MEDIA_ROOTS` | Opcional; **recomendado restringir** | Pastas locais autorizadas para upload. Exemplo: `C:\MCP\midias`. Várias pastas: separar por `;` no Windows. |

Escolha **um** formato:

- **Uma wiki:** preencha `WP_BASE_URL`; deixe `WP_USER_BASE_URL` e `WP_DEVELOPER_BASE_URL` vazias.
- **Duas wikis:** deixe `WP_BASE_URL` vazia; preencha as duas URLs específicas. As duas usam o mesmo login e Application Password, que precisam funcionar em ambas.

Com duas wikis, informe ao Claude qual utilizar: **`user`** (usuários) ou **`developer`** (informática).

**Atenção:** `WP_ALLOWED_MEDIA_ROOTS` vazio permite upload de qualquer caminho local legível pelo processo, respeitados os formatos/tamanhos permitidos. As listas vazias de escopo na política WordPress também significam acesso irrestrito ao escopo correspondente, não bloqueio. Restrinja conforme sua autorização.

### 4.3 Kanboard — integração opcional

| Variável | Obrigatoriedade ao usar Kanboard | O que informar |
|---|---|---|
| `KANBOARD_API_URL` | **Obrigatória** | Endpoint HTTPS completo, como `https://kanboard.exemplo.org/kanboard/jsonrpc.php`. Sem usuário/senha na URL, query ou fragmento. |
| `KANBOARD_API_KEY` | **Obrigatória e secreta** | Chave da API da aplicação ou token pessoal autorizado. |
| `KANBOARD_USERNAME` | Condicional | Com chave da aplicação, mantenha `jsonrpc`. Com **token pessoal**, informe o **login exato do titular**, não `jsonrpc`. |
| `KANBOARD_ALLOWED_HTTP_URL` | Opcional; deixe vazia normalmente | Exceção para servidor sem HTTPS: repetir exatamente a URL HTTP de `KANBOARD_API_URL`, inclusive caminho e porta. |

**Escolha do acesso:**

- Chave da aplicação + `jsonrpc`: **somente leitura pelo MCP**. A chave global pode alcançar vários projetos; prefira permissões mínimas.
- Token pessoal + login do titular: leituras e, se autorizado, comentário/edição de título ou descrição. A API precisa confirmar a identidade em `getMe` e cada escrita exige aprovação específica.

Não use `true` na exceção HTTP. **HTTP transmite a chave sem criptografia**; habilite somente após orientação e aceitação do risco. Não há fallback automático para HTTP.

Relatórios cruzados Kanboard/TFS precisam das duas integrações para uma comparação completa. Se TFS não estiver disponível, o relatório pode trazer dados parciais e indicar a limitação.

### 4.4 Oracle — integração opcional

Configure somente os ambientes autorizados. Cada ambiente precisa do trio **conexão + usuário + senha** completo:

| Variáveis por ambiente | Obrigatoriedade ao usar o ambiente | O que informar |
|---|---|---|
| `ORACLE_CONNECT_STRING_DEV`, `ORACLE_CONNECT_STRING_HOM`, `ORACLE_CONNECT_STRING_PRO` | **Obrigatória para cada ambiente escolhido** | `servidor:1521/nome_do_servico` ou alias TNS válido. Não coloque senha na conexão. |
| `ORACLE_USER_DEV`, `ORACLE_USER_HOM`, `ORACLE_USER_PRO` | **Obrigatória para cada ambiente escolhido** | Usuário Oracle autorizado, preferencialmente com permissões mínimas de leitura. Sem colchetes em torno do login. |
| `ORACLE_PASSWORD_DEV`, `ORACLE_PASSWORD_HOM`, `ORACLE_PASSWORD_PRO` | **Obrigatória e secreta para cada ambiente escolhido** | Senha do usuário daquele ambiente. |
| `ORACLE_TNS_ADMIN_DEV`, `ORACLE_TNS_ADMIN_HOM`, `ORACLE_TNS_ADMIN_PRO` | Condicional | Em Thin mode, se usar alias TNS, informe a **pasta** que contém `tnsnames.ora`; não o caminho do arquivo. Desnecessária com conexão direta. |
| `ORACLE_READONLY_FUNCTIONS_DEV`, `ORACLE_READONLY_FUNCTIONS_HOM`, `ORACLE_READONLY_FUNCTIONS_PRO` | Opcional; restrição recomendada conforme autorização | Funções aprovadas no formato `OWNER.PACKAGE.FUNCTION`, separadas por vírgulas. |

**Ambientes:** DEV é desenvolvimento, HOM é homologação, PRO é produção. DEV é sempre o padrão; peça HOM/PRO explicitamente. Se DEV não estiver configurado, o servidor não muda silenciosamente para outro ambiente.

O MCP Oracle oferece consultas, metadados e funções escalares; **não oferece escrita no banco**. Entretanto, funções podem ter efeitos autônomos/externos mesmo em transação `READ ONLY`. **Allowlist vazia permite todas as funções compatíveis concedidas ao usuário; não significa bloqueio.** Consulte o responsável para definir funções seguras e permissões restritas.

Se informar um usuário alternativo em uma chamada, a senha continua sendo a do ambiente configurado; isso não cria um novo perfil de senha.

#### Oracle avançado — somente se necessário

Por padrão, o driver usa **Thin mode**, sem instalar Oracle Client.

| Variável | Obrigatoriedade | O que informar |
|---|---|---|
| `ORACLE_CLIENT_LIB_DIR` | Somente para usar Thick mode | Pasta de bibliotecas do **Oracle Instant Client 19+**, compatível com a arquitetura do Node.js. Pode ser necessário em erro `NJS-116`. |
| `ORACLE_CLIENT_CONFIG_DIR` | Opcional no Thick mode | Pasta TNS compartilhada. Se vazia, utiliza `ORACLE_TNS_ADMIN_DEV`. |

No Thick mode, aliases DEV/HOM/PRO precisam estar no diretório TNS compartilhado. Uma instalação antiga pode fornecer o arquivo TNS, mas suas bibliotecas não necessariamente atendem ao requisito de Instant Client 19+.

### 4.5 Configurações gerais — opcionais

Não é necessário preencher manualmente estas variáveis para iniciar: existem padrões. Recomenda-se manter os valores do modelo, especialmente a confirmação de escrita.

| Variável | Padrão / orientação |
|---|---|
| `MCP_REQUIRE_CONFIRMATION` | **Mantenha `true`**: revisar o diff e responder `CONFIRMO` antes de aplicar. `false` remove apenas a exigência literal; não elimina plano/token/preflight nem aprovações específicas. |
| `MCP_REQUEST_TIMEOUT_MS` | `30000`: timeout externo em milissegundos. |
| `MCP_CONFIRMATION_TTL_SECONDS` | `900`: planos expiram em 15 minutos. |
| `MCP_AUDIT_LOG_PATH` | `.local/audit.jsonl`: auditoria local. Vazia desabilita. |
| `MCP_TFS_POLICY_PATH` | `config/tfs-sarah.yaml`: tipos, hierarquia e campos autorizados. |
| `MCP_WORDPRESS_POLICY_PATH` | `config/wordpress.yaml`: política WordPress padrão. |
| `MCP_WORDPRESS_USER_POLICY_PATH` | Vazia: usa a política padrão. Preencha somente para política específica da wiki user. |
| `MCP_WORDPRESS_DEVELOPER_POLICY_PATH` | Vazia: usa a política padrão. Preencha somente para política específica da wiki developer. |
| `MCP_DASHBOARD_PORT` | `3333`: somente para o painel auxiliar. |
| `MCP_DASHBOARD_OPEN` | `true`: abre o navegador ao executar o painel. `false` impede a abertura automática. |
| `MCP_LIVE_TESTS` | **Deixe vazia no uso normal**. `CONFIRMO_LEITURA` habilita testes reais opt-in, executados separadamente; não é necessária para o chat. |

Não invente IDs/caminhos de políticas remotas nem altere permissões sem orientação. Guarde a configuração local e feche seu editor antes de anexar arquivos ao chat para evitar envio acidental de segredos.

## 5. Conecte o MCP ao seu chat

Os exemplos abaixo fixam a pasta de trabalho antes de iniciar o servidor. Isso é necessário porque o MCP carrega a configuração local e os caminhos de políticas a partir dessa pasta, mesmo quando você trabalha em outro projeto.

### Opção A — extensão Claude Code da Anthropic

No terminal PowerShell do VS Code, execute:

```powershell
claude mcp add --transport stdio --scope user mcp_sarah -- node --input-type=module --eval "process.chdir('C:/MCP/mcp-sarah'); await import('file:///C:/MCP/mcp-sarah/dist/index.js');"
```

- `--scope user`: disponível para você em todos os seus projetos, sem compartilhar a configuração com outros usuários.
- Se quiser usar somente no projeto atual, execute o cadastro **na pasta desse projeto** e troque `--scope user` por `--scope local`.
- O nome `mcp_sarah` identifica o servidor. Não cadastre o mesmo nome em vários escopos sem necessidade.
- A configuração da extensão Claude Code é distinta da configuração MCP do Copilot e do Claude Desktop.

Confira:

```powershell
claude mcp list
claude mcp get mcp_sarah
```

Reabra a sessão da extensão; se necessário, use **Developer: Reload Window** na paleta do VS Code. Revise as solicitações de confiança/permissão. No Claude Code interativo do terminal, `/mcp` também permite conferir e reconectar servidores.

Se já houver uma entrada incorreta no escopo de usuário, remova **apenas essa entrada** e cadastre novamente com o caminho correto:

```powershell
claude mcp remove mcp_sarah --scope user
```

### Opção B — GitHub Copilot com modelo Claude

1. Pressione `Ctrl+Shift+P` e execute **MCP: Open User Configuration**. A configuração de usuário disponibiliza o servidor em seus diferentes projetos.
2. Adicione `mcp_sarah` ao objeto **`servers`**, preservando servidores e outros campos já existentes. Se o arquivo estiver vazio, use o bloco inteiro abaixo.

```json
{
  "servers": {
    "mcp_sarah": {
      "type": "stdio",
      "command": "node",
      "args": [
        "--input-type=module",
        "--eval",
        "process.chdir('C:/MCP/mcp-sarah'); await import('file:///C:/MCP/mcp-sarah/dist/index.js');"
      ]
    }
  }
}
```

3. Salve e execute **MCP: List Servers**; selecione `mcp_sarah` e inicie-o. Revise e aprove a confiança se solicitada.
4. No chat do Copilot, escolha **Agent**, selecione um modelo **Claude** disponível no seu plano e confira as ferramentas habilitadas.

**Importante:** o VS Code usa `servers`; não cole o bloco `mcpServers` do Claude Desktop neste formato. Para limitar ao workspace, use **MCP: Open Workspace Folder Configuration** em vez da configuração de usuário; não coloque credenciais no arquivo compartilhável.

Se os comandos MCP não aparecerem, atualize o VS Code e verifique políticas da organização e disponibilidade do recurso.

### Caminhos e executáveis — vale para as duas opções

- Outra instalação? Ajuste **`C:/MCP/mcp-sarah` e `file:///C:/MCP/mcp-sarah/dist/index.js`** juntos.
- Caminhos no JavaScript do exemplo usam `/`. Se a pasta tiver espaços, eles permanecem dentro das aspas; na URL `file:///`, codifique espaços como `%20`.
- Se aparecer `spawn node ENOENT`, o cliente não encontrou Node.js. Reabra o VS Code após instalar Node ou use o caminho absoluto do executável, normalmente `C:/Program Files/nodejs/node.exe`.
- Para descobrir o caminho do Node no PowerShell: `(Get-Command node).Source`.
- Não copie a conta do proprietário do repositório para as credenciais das integrações: **use seu próprio usuário autorizado**.

## 6. Verifique sem realizar escritas

Primeiro, envie no chat conectado:

> Consulte o status do MCP Sarah sem testar conexões. Informe quais integrações estão configuradas e quais estão ausentes, sem exibir credenciais e sem alterar nada.

Depois, se autorizado a acessar os serviços configurados:

> Teste as conexões configuradas do MCP Sarah e informe o resultado por integração. Não realize alterações nem chame funções Oracle.

O status sem teste não acessa serviços externos; com teste, faz consultas às integrações configuradas. Não é necessário configurar todas. Uma integração ausente pode continuar aparecendo no catálogo, mas suas ferramentas não funcionarão até completar as variáveis correspondentes.

Exemplos iniciais, conforme suas permissões:

- “Liste os projetos do Kanboard, sem alterar nada.”
- “Busque work items com a palavra cadastro no TFS, sem alterar nada.”
- “Busque páginas sobre manual na wiki user, sem alterar nada.”
- “Descreva a tabela que eu indicar no Oracle DEV, sem ler dados de pessoas.”

## 7. Segurança e uso diário

- **Não envie o arquivo de ambiente ao Claude, ao GitHub ou a colegas.** Ele contém segredos; cada pessoa configura suas credenciais localmente.
- Não coloque segredos em prints, comandos de cadastro MCP, logs compartilhados ou este guia. Se uma credencial for exposta, revogue/rotacione no serviço correspondente.
- Dados retornados pelas ferramentas podem ser enviados ao provedor do modelo. Use somente informações cujo tratamento nesse serviço seja autorizado pela instituição; evite dados pessoais/sensíveis desnecessários.
- Comece com consultas e mantenha `MCP_REQUIRE_CONFIRMATION=true`.
- Escritas seguem **preparar → revisar alvo e diff → confirmar → aplicar**. A aprovação do cliente de IA é independente da confirmação do MCP.
- Bugs e sua Task de Testes no TFS exigem aprovação da proposta; escritas pessoais no Kanboard exigem aprovação específica de identidade, alvo e conteúdo, inclusive no modo sem confirmação literal.
- Não desabilite as permissões do cliente para contornar confirmações. Em falha de escrita com resultado desconhecido, consulte o estado antes de tentar novamente.
- Depois de mudar variáveis, **reinicie/reconecte o servidor MCP**. Não precisa recompilar por alterar apenas configuração.
- Reiniciar invalida planos de escrita e resultados paginados temporários; prepare novamente se necessário.
- O painel `npm run dev` é opcional e separado da conexão do chat. O cliente inicia sua própria instância do servidor.

## 8. Atualizar o MCP

Na pasta da instalação, execute um comando por vez; pare se houver erro:

```powershell
Set-Location C:\MCP\mcp-sarah
git pull --ff-only
npm ci
npm run build
```

Não refaça a cópia do modelo sobre sua configuração. Compare [.env.example](../.env.example) com suas variáveis para identificar novidades e reinicie/reconecte o MCP no seu cliente.

Se `git pull` informar alterações locais/conflitos, não descarte arquivos automaticamente; peça orientação.

## 9. Problemas comuns

| Problema | Como resolver |
|---|---|
| `node`, `npm`, `git` ou `claude` não encontrado | Instale o requisito/CLI e reabra o VS Code. Para o servidor, use caminho absoluto de Node se necessário. |
| PowerShell bloqueia execução de `npm.ps1` | Use `npm.cmd ci` e `npm.cmd run build`; não mude a política institucional para contornar o bloqueio. |
| Arquivo compilado ausente | Execute `npm run build` na instalação; verifique o resultado e os caminhos do cadastro. |
| MCP conecta, mas integração retorna `CONFIG_MISSING` | Complete os campos obrigatórios dessa integração e reconecte; confira a pasta de trabalho configurada. |
| Alteração de variável não teve efeito | Reconecte/reinicie. Variáveis já definidas no ambiente do processo podem prevalecer sobre as do arquivo local. |
| HTTP 401/403 | Confira credencial, validade, usuário e permissões no serviço; não publique o token para diagnóstico. |
| Timeout/DNS/conexão recusada | Confira VPN, endereço, porta, firewall e disponibilidade do serviço. |
| Kanboard recusa HTTP | HTTPS é o padrão; a exceção precisa coincidir com a URL inteira e exige aceitação do risco. |
| Oracle não encontra alias TNS | Confira a pasta TNS e o nome exato do alias, inclusive domínio, com o responsável. Não copie caminhos de outra máquina. |
| Oracle `NJS-116` | Avalie Instant Client 19+ e Thick mode com o responsável; não altere senha/segurança do banco para contornar. |
| Ferramentas não aparecem no chat | Confira cliente/extensão, servidor conectado, ferramentas habilitadas, modo Agent no Copilot e políticas da organização. |
| Cadastro duplicado no Claude Code | Confira `claude mcp list` e os escopos; remova apenas a entrada incorreta, preservando outras configurações. |

Para pedir ajuda, envie **somente mensagem de erro sanitizada, versão do Node, nome da extensão e etapa que falhou**. Não envie o arquivo de ambiente nem dumps de autenticação.

## 10. Checklist final

- [ ] Identifiquei Claude Code ou Copilot e configurei apenas o cliente usado.
- [ ] Instalei os requisitos e compilei o MCP sem erro.
- [ ] Substituí exemplos por dados reais autorizados somente nas integrações escolhidas.
- [ ] Configurei minhas próprias credenciais localmente e não as compartilhei.
- [ ] Mantive confirmação de escrita e revisei permissões/escopos.
- [ ] Cadastrei a pasta correta, reconectei o MCP e consultei o status.
- [ ] Testei conexões autorizadas e fiz uma consulta sem escrita.

## Referências

- [Configuração completa do MCP Sarah](configuration.md)
- [Catálogo de ferramentas](tools.md)
- [Segurança](security.md)
- [Claude Code: MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code no VS Code](https://code.claude.com/docs/en/vs-code)
- [MCP no VS Code / Copilot](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)
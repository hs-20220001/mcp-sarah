# Regras para commit message

- Gere a mensagem em portugues do brasil.
- Use padrao Conventional Commits.
- Formato obrigatorio do titulo: `<tipo>(<escopo>): <descricao>`.
- Tipos permitidos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`.
- Escreva tudo em minusculo.
- Nao use acentuacao.
- Descricao do titulo deve ser curta, clara e no infinitivo.
- Nao use emoji, aspas, ponto final ou texto extra no titulo.
- Apos o titulo, adicione uma linha em branco.
- Em seguida, gere uma descricao detalhada no corpo do commit.
- O corpo deve explicar, quando aplicavel:
  - contexto do problema
  - causa raiz
  - solucao aplicada
  - impacto da mudanca
- Use frases objetivas e linguagem tecnica.
- Pode usar paragrafos ou listas no corpo.
- Nao use emoji no corpo.
- Evite repeticao do titulo no corpo.
- Retorne somente a mensagem final do commit.

Formato final esperado:

```text
<tipo>(<escopo>): <descricao>

<contexto>
<causa>
<solucao>
<impacto>
```

Exemplos:

```text
feat(ativos): padronizar retorno de endpoints com ativodetalhedto

contexto:
retornos inconsistentes entre endpoints de ativos

causa:
ausencia de padrao unificado de dto

solucao:
implementado ativodetalhedto como modelo padrao

impacto:
maior previsibilidade para integracoes frontend
```

```text
fix(auth): corrigir validacao de refresh token

contexto:
tokens expirados nao eram invalidados corretamente

causa:
falha na verificacao de data de expiracao

solucao:
ajustada regra de validacao no middleware

impacto:
reduz risco de acesso indevido
```

```text
chore(web): ajustar configuracao de ambiente

contexto:
variaveis divergentes entre homologacao e producao

solucao:
unificacao dos arquivos env

impacto:
reduz erros em deploy
```

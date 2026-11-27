import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/core/config.js'

describe('loadConfig', () => {
  it('relata separadamente as credenciais ausentes de todas as integrações', () => {
    const config = loadConfig({}, 'C:\\repo')

    expect(config.requireConfirmation).toBe(true)
    expect(config.tfs).toBeUndefined()
    expect(config.wordpress).toBeUndefined()
    expect(config.oracle).toBeUndefined()
    expect(config.kanboard).toBeUndefined()
    expect(config.configurationIssues.kanboard).toEqual(['KANBOARD_API_URL', 'KANBOARD_API_KEY'])
    expect(config.configurationIssues.tfs).toContain('AZURE_DEVOPS_PAT')
    expect(config.configurationIssues.wordpress).toContain('WP_APPLICATION_PASSWORD')
    expect(config.configurationIssues.oracle).toContain('ORACLE_PASSWORD_DEV')
  })

  it('carrega cada módulo de forma independente', () => {
    const config = loadConfig({
      AZURE_DEVOPS_ORG_URL: 'https://tfs.example/tfs/DefaultCollection/',
      AZURE_DEVOPS_PROJECT: 'Sarah',
      AZURE_DEVOPS_PAT: 'secret',
    }, 'C:\\repo')

    expect(config.tfs?.organizationUrl).toBe('https://tfs.example/tfs/DefaultCollection')
    expect(config.tfs?.apiVersion).toBe('7.0')
    expect(config.configurationIssues.wordpress).toContain('WP_APPLICATION_PASSWORD')
  })

  it('configura o Kanboard isoladamente e distingue chave de aplicação de token pessoal', () => {
    const env = { KANBOARD_API_URL: 'https://kb.example/kanboard/jsonrpc.php', KANBOARD_API_KEY: 'teste' }
    expect(loadConfig(env).kanboard).toEqual({ apiUrl: env.KANBOARD_API_URL, apiKey: 'teste', username: 'jsonrpc' })
    expect(loadConfig({ ...env, KANBOARD_USERNAME: 'leitor' }).kanboard?.username).toBe('leitor')
    expect(loadConfig({ ...env, KANBOARD_API_KEY: ' ' }).configurationIssues.kanboard).toEqual(['KANBOARD_API_KEY'])
  })

  it('só libera HTTP quando a exceção corresponde a todo o endpoint Kanboard', () => {
    const endpoint = 'http://kb.example:8181/kanboard/jsonrpc.php'
    const env = { KANBOARD_API_URL: endpoint, KANBOARD_API_KEY: 'teste' }
    expect(loadConfig({ ...env, KANBOARD_ALLOWED_HTTP_URL: endpoint }).kanboard?.apiUrl).toBe(endpoint)
    for (const allowed of ['', 'true', '*', endpoint.replace('8181', '8080'), endpoint.replace('kb.example', 'outro.example'), endpoint.replace('/kanboard', '/outro')]) {
      const config = loadConfig({ ...env, KANBOARD_ALLOWED_HTTP_URL: allowed })
      expect(config.kanboard).toBeUndefined()
      expect(config.configurationIssues.kanboard?.join()).toContain('KANBOARD_ALLOWED_HTTP_URL')
    }
  })

  it.each(['ftp://kb.example/jsonrpc.php', 'http://user:senha@kb.example/jsonrpc.php', 'http://kb.example/jsonrpc.php?key=segredo', 'http://kb.example/jsonrpc.php#frag', 'http://kb.example/'])('a exceção não libera um endpoint inválido: %s', endpoint => {
    expect(loadConfig({ KANBOARD_API_URL: endpoint, KANBOARD_ALLOWED_HTTP_URL: endpoint, KANBOARD_API_KEY: 'teste' }).kanboard).toBeUndefined()
  })

  it.each(['invalida', 'http://kb.example/jsonrpc.php', 'https://user:segredo@kb.example/jsonrpc.php', 'https://kb.example/jsonrpc.php?key=segredo', 'https://kb.example/'])('recusa endpoint inválido sem ecoar seu valor: %s', apiUrl => {
    const config = loadConfig({ KANBOARD_API_URL: apiUrl, KANBOARD_API_KEY: 'teste' })
    expect(config.kanboard).toBeUndefined()
    expect(config.configurationIssues.kanboard?.join()).toContain('KANBOARD_API_URL')
    expect(config.configurationIssues.kanboard?.join()).not.toContain(apiUrl)
  })

  it('bloqueia credenciais WordPress fora de HTTPS', () => {
    const config = loadConfig({
      WP_BASE_URL: 'http://docs.example',
      WP_USERNAME: 'user',
      WP_APPLICATION_PASSWORD: 'secret',
    })
    expect(config.wordpress).toBeUndefined()
    expect(config.configurationIssues.wordpress).toContain('WP_BASE_URL deve usar HTTPS')
  })

  it('carrega duas wikis WordPress com credenciais compartilhadas', () => {
    const config = loadConfig({
      WP_USER_BASE_URL: 'https://users.example/',
      WP_DEVELOPER_BASE_URL: 'https://developers.example/',
      WP_USERNAME: 'user',
      WP_APPLICATION_PASSWORD: 'secret',
      MCP_WORDPRESS_USER_POLICY_PATH: 'config/users.yaml',
      MCP_WORDPRESS_DEVELOPER_POLICY_PATH: 'config/developers.yaml',
    }, 'C:\\repo')

    expect(config.wordpress).toMatchObject({
      username: 'user',
      wikis: {
        user: { baseUrl: 'https://users.example', policyPath: 'C:\\repo\\config\\users.yaml' },
        developer: { baseUrl: 'https://developers.example', policyPath: 'C:\\repo\\config\\developers.yaml' },
      },
    })
  })

  it('permite desativar somente a confirmação humana por variável explícita', () => {
    const config = loadConfig({ MCP_REQUIRE_CONFIRMATION: 'false' }, 'C:\\repo')

    expect(config.requireConfirmation).toBe(false)
  })

  it('carrega perfis Oracle DEV, HOM e PRO sem compartilhar usuário ou senha', () => {
    const config = loadConfig({
      ORACLE_CONNECT_STRING_DEV: 'dev-db/SERVICE', ORACLE_USER_DEV: 'dev_user', ORACLE_PASSWORD_DEV: 'dev_password',
      ORACLE_TNS_ADMIN_DEV: 'C:\\oracle\\network\\admin',
      ORACLE_CONNECT_STRING_HOM: 'hom-db/SERVICE', ORACLE_USER_HOM: 'hom_user', ORACLE_PASSWORD_HOM: 'hom_password',
      ORACLE_CONNECT_STRING_PRO: 'pro-db/SERVICE', ORACLE_USER_PRO: 'pro_user', ORACLE_PASSWORD_PRO: 'pro_password',
    })
    expect(config.oracle?.profiles).toEqual({
      DEV: { connectString: 'dev-db/SERVICE', username: 'dev_user', password: 'dev_password', tnsAdmin: 'C:\\oracle\\network\\admin', readonlyFunctions: [] },
      HOM: { connectString: 'hom-db/SERVICE', username: 'hom_user', password: 'hom_password', readonlyFunctions: [] },
      PRO: { connectString: 'pro-db/SERVICE', username: 'pro_user', password: 'pro_password', readonlyFunctions: [] },
    })
    expect(config.configurationIssues.oracle).toBeUndefined()
  })

  it('carrega os diretórios globais do Oracle Client para o modo Thick', () => {
    const config = loadConfig({
      ORACLE_CONNECT_STRING_DEV: 'BSBDSV', ORACLE_USER_DEV: 'app_dev', ORACLE_PASSWORD_DEV: 'secret',
      ORACLE_CLIENT_LIB_DIR: 'C:\\oracle\\instantclient_19_17',
      ORACLE_CLIENT_CONFIG_DIR: 'C:\\oracle\\network\\admin',
    }, 'C:\\repo')

    expect(config.oracle?.clientLibDir).toBe('C:\\oracle\\instantclient_19_17')
    expect(config.oracle?.clientConfigDir).toBe('C:\\oracle\\network\\admin')
  })
})

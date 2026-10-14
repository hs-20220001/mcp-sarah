import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/core/config.js'

describe('loadConfig', () => {
  it('relata separadamente as credenciais ausentes de todas as integrações', () => {
    const config = loadConfig({}, 'C:\\repo')

    expect(config.requireConfirmation).toBe(true)
    expect(config.tfs).toBeUndefined()
    expect(config.wordpress).toBeUndefined()
    expect(config.oracle).toBeUndefined()
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

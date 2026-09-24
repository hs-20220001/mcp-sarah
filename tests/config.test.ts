import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/core/config.js'

describe('loadConfig', () => {
  it('relata separadamente as credenciais ausentes de todas as integrações', () => {
    const config = loadConfig({}, 'C:\\repo')

    expect(config.requireConfirmation).toBe(true)
    expect(config.tfs).toBeUndefined()
    expect(config.wordpress).toBeUndefined()
    expect(config.configurationIssues.tfs).toContain('AZURE_DEVOPS_PAT')
    expect(config.configurationIssues.wordpress).toContain('WP_APPLICATION_PASSWORD')
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
})

import { config as loadDotEnv } from 'dotenv'
import { delimiter, resolve } from 'node:path'

loadDotEnv({ quiet: true })

export type ModuleId = 'tfs' | 'wordpress' | 'oracle' | 'kanboard'

export interface KanboardConfig {
  apiUrl: string
  apiKey: string
  username: string
}

export const oracleEnvironments = ['DEV', 'HOM', 'PRO'] as const
export type OracleEnvironment = (typeof oracleEnvironments)[number]

export interface OracleProfileConfig {
  connectString: string
  username: string
  password: string
  tnsAdmin?: string
  readonlyFunctions: string[]
}

export interface OracleConfig {
  profiles: Partial<Record<OracleEnvironment, OracleProfileConfig>>
  clientLibDir?: string
  clientConfigDir?: string
}

export const wordPressWikis = ['user', 'developer'] as const
export type WordPressWiki = (typeof wordPressWikis)[number]

export interface TfsConfig {
  organizationUrl: string
  project: string
  pat: string
  apiVersion: string
  policyPath: string
}

export interface WordPressWikiConfig {
  baseUrl: string
  policyPath: string
}

export interface WordPressConfig {
  username: string
  applicationPassword: string
  allowedMediaRoots: string[]
  wikis: Partial<Record<WordPressWiki, WordPressWikiConfig>>
}

export interface WordPressClientConfig {
  baseUrl: string
  username: string
  applicationPassword: string
}

export interface AppConfig {
  requestTimeoutMs: number
  confirmationTtlMs: number
  requireConfirmation: boolean
  auditLogPath?: string
  tfs?: TfsConfig
  wordpress?: WordPressConfig
  oracle?: OracleConfig
  kanboard?: KanboardConfig
  configurationIssues: Partial<Record<ModuleId, string[]>>
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function booleanFlag(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return fallback
}

function requiredValues(entries: Record<string, string | undefined>): string[] {
  return Object.entries(entries).filter(([, value]) => !value?.trim()).map(([name]) => name)
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): AppConfig {
  const configurationIssues: AppConfig['configurationIssues'] = {}
  let tfs: TfsConfig | undefined
  let wordpress: WordPressConfig | undefined
  let oracle: OracleConfig | undefined
  let kanboard: KanboardConfig | undefined

  {
    const apiUrl = env.KANBOARD_API_URL?.trim()
    const apiKey = env.KANBOARD_API_KEY?.trim()
    const missing = requiredValues({ KANBOARD_API_URL: apiUrl, KANBOARD_API_KEY: apiKey })
    if (!apiUrl || !apiKey) configurationIssues.kanboard = missing
    else {
      const url = URL.canParse(apiUrl) ? new URL(apiUrl) : undefined
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[?#]/.test(apiUrl) || !url.pathname.endsWith('/jsonrpc.php')) {
        configurationIssues.kanboard = ['KANBOARD_API_URL deve ser um endpoint terminado em /jsonrpc.php, sem credenciais, query ou fragmento; prefira HTTPS']
      } else if (url.protocol === 'http:' && apiUrl !== env.KANBOARD_ALLOWED_HTTP_URL?.trim()) {
        configurationIssues.kanboard = ['KANBOARD_API_URL usa HTTP sem criptografia; use HTTPS ou autorize a URL exata em KANBOARD_ALLOWED_HTTP_URL']
      } else {
        kanboard = { apiUrl: url.href, apiKey, username: env.KANBOARD_USERNAME?.trim() || 'jsonrpc' }
      }
    }
  }

  {
    const organizationUrl = env.AZURE_DEVOPS_ORG_URL
    const project = env.AZURE_DEVOPS_PROJECT
    const pat = env.AZURE_DEVOPS_PAT
    const missing = requiredValues({
      AZURE_DEVOPS_ORG_URL: organizationUrl,
      AZURE_DEVOPS_PROJECT: project,
      AZURE_DEVOPS_PAT: pat,
    })
    if (missing.length > 0) configurationIssues.tfs = missing
    else if (organizationUrl && project && pat) {
      tfs = {
        organizationUrl: organizationUrl.replace(/\/$/, ''),
        project,
        pat,
        apiVersion: env.AZURE_DEVOPS_API_VERSION ?? '7.0',
        policyPath: resolve(cwd, env.MCP_TFS_POLICY_PATH ?? 'config/tfs-sarah.yaml'),
      }
    }
  }

  {
    const userBaseUrl = env.WP_USER_BASE_URL?.trim() || env.WP_BASE_URL
    const developerBaseUrl = env.WP_DEVELOPER_BASE_URL
    const username = env.WP_USERNAME
    const applicationPassword = env.WP_APPLICATION_PASSWORD
    const missing = requiredValues({
      WP_USERNAME: username,
      WP_APPLICATION_PASSWORD: applicationPassword,
    })
    if (!userBaseUrl?.trim() && !developerBaseUrl?.trim()) missing.push('WP_BASE_URL ou WP_USER_BASE_URL/WP_DEVELOPER_BASE_URL')
    const configuredUrls = [
      { wiki: 'user' as const, baseUrl: userBaseUrl, variable: env.WP_USER_BASE_URL?.trim() ? 'WP_USER_BASE_URL' : 'WP_BASE_URL' },
      { wiki: 'developer' as const, baseUrl: developerBaseUrl, variable: 'WP_DEVELOPER_BASE_URL' },
    ].flatMap(entry => {
      const baseUrl = entry.baseUrl?.trim()
      return baseUrl ? [{ wiki: entry.wiki, baseUrl, variable: entry.variable }] : []
    })
    if (missing.length > 0) configurationIssues.wordpress = missing
    else if (configuredUrls.some(entry => !entry.baseUrl.startsWith('https://'))) {
      configurationIssues.wordpress = configuredUrls
        .filter(entry => !entry.baseUrl.startsWith('https://'))
        .map(entry => `${entry.variable} deve usar HTTPS`)
    } else if (username && applicationPassword) {
      const sharedPolicyPath = env.MCP_WORDPRESS_POLICY_PATH ?? 'config/wordpress.yaml'
      wordpress = {
        username,
        applicationPassword,
        allowedMediaRoots: (env.WP_ALLOWED_MEDIA_ROOTS ?? '')
          .split(delimiter)
          .map(path => path.trim())
          .filter(Boolean)
          .map(path => resolve(path)),
        wikis: Object.fromEntries(configuredUrls.map(entry => [entry.wiki, {
          baseUrl: entry.baseUrl.replace(/\/$/, ''),
          policyPath: resolve(cwd, entry.wiki === 'user'
            ? env.MCP_WORDPRESS_USER_POLICY_PATH ?? sharedPolicyPath
            : env.MCP_WORDPRESS_DEVELOPER_POLICY_PATH ?? sharedPolicyPath),
        }])),
      }
    }
  }

  {
    const profiles: Partial<Record<OracleEnvironment, OracleProfileConfig>> = {}
    const missingByEnvironment: string[][] = []
    for (const environment of oracleEnvironments) {
      const suffix = `_${environment}`
      const connectString = env[`ORACLE_CONNECT_STRING${suffix}`]
      const username = env[`ORACLE_USER${suffix}`]
      const password = env[`ORACLE_PASSWORD${suffix}`]
      const tnsAdmin = env[`ORACLE_TNS_ADMIN${suffix}`]?.trim()
      const readonlyFunctions = (env[`ORACLE_READONLY_FUNCTIONS${suffix}`] ?? '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean)
      const invalidFunctions = readonlyFunctions.filter(value => !/^[A-Z][A-Z0-9_$#]{0,127}\.[A-Z][A-Z0-9_$#]{0,127}\.[A-Z][A-Z0-9_$#]{0,127}$/.test(value))
      if (invalidFunctions.length > 0) configurationIssues.oracle = [...(configurationIssues.oracle ?? []), `ORACLE_READONLY_FUNCTIONS${suffix} aceita apenas OWNER.PACKAGE.FUNCTION`]
      const missing = requiredValues({
        [`ORACLE_CONNECT_STRING${suffix}`]: connectString,
        [`ORACLE_USER${suffix}`]: username,
        [`ORACLE_PASSWORD${suffix}`]: password,
      })
      if (missing.length > 0) missingByEnvironment.push(missing)
      else if (connectString && username && password) profiles[environment] = {
        connectString,
        username,
        password,
        ...(tnsAdmin ? { tnsAdmin: resolve(cwd, tnsAdmin) } : {}),
        readonlyFunctions: readonlyFunctions.filter(value => !invalidFunctions.includes(value)),
      }
    }
    if (Object.keys(profiles).length > 0) {
      const clientLibDir = env.ORACLE_CLIENT_LIB_DIR?.trim()
      const clientConfigDir = env.ORACLE_CLIENT_CONFIG_DIR?.trim()
      oracle = {
        profiles,
        ...(clientLibDir ? { clientLibDir: resolve(cwd, clientLibDir) } : {}),
        ...(clientConfigDir ? { clientConfigDir: resolve(cwd, clientConfigDir) } : {}),
      }
    }
    if (!profiles.DEV) configurationIssues.oracle = missingByEnvironment.find(items => items.some(name => name.endsWith('_DEV'))) ?? ['ORACLE_CONNECT_STRING_DEV', 'ORACLE_USER_DEV', 'ORACLE_PASSWORD_DEV']
  }

  const auditLogPath = env.MCP_AUDIT_LOG_PATH?.trim()
  return {
    requestTimeoutMs: positiveInteger(env.MCP_REQUEST_TIMEOUT_MS, 30_000),
    confirmationTtlMs: positiveInteger(env.MCP_CONFIRMATION_TTL_SECONDS, 900) * 1_000,
    requireConfirmation: booleanFlag(env.MCP_REQUIRE_CONFIRMATION, true),
    ...(auditLogPath ? { auditLogPath: resolve(cwd, auditLogPath) } : {}),
    ...(tfs ? { tfs } : {}),
    ...(wordpress ? { wordpress } : {}),
    ...(oracle ? { oracle } : {}),
    ...(kanboard ? { kanboard } : {}),
    configurationIssues,
  }
}

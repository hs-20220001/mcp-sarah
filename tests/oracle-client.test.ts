import oracledb from 'oracledb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/core/config.js'
import type { OracleRow } from '../src/modules/oracle/client.js'
import { OracleClient } from '../src/modules/oracle/client.js'

function makeConnection(responses: Array<{ rows?: OracleRow[]; metaData?: Array<{ name: string }> }> = []) {
  const execute = vi.fn((...args: unknown[]) => Promise.resolve(args[0] === 'SET TRANSACTION READ ONLY' ? {} : responses.shift() ?? {}))
  const connection = { execute, rollback: vi.fn(() => Promise.resolve(undefined)), close: vi.fn(() => Promise.resolve(undefined)) }
  return { connection, execute }
}

const fullOracleEnv = {
  ORACLE_CONNECT_STRING_DEV: 'db-dev.example:1521/SARAH',
  ORACLE_USER_DEV: 'app_dev',
  ORACLE_PASSWORD_DEV: 'dev-secret',
  ORACLE_READONLY_FUNCTIONS_DEV: '',
  ORACLE_CONNECT_STRING_HOM: 'db-hom.example:1521/SARAH',
  ORACLE_USER_HOM: 'app_hom',
  ORACLE_PASSWORD_HOM: 'hom-secret',
  ORACLE_CONNECT_STRING_PRO: 'db-pro.example:1521/SARAH',
  ORACLE_USER_PRO: 'app_pro',
  ORACLE_PASSWORD_PRO: 'pro-secret',
}

afterEach(() => vi.restoreAllMocks())

describe('Oracle configuration and read-only client', () => {
  it('loads environment profiles independently and reports missing DEV', () => {
    const config = loadConfig({
      ORACLE_CONNECT_STRING_HOM: 'db-hom.example:1521/SARAH',
      ORACLE_USER_HOM: 'app_hom',
      ORACLE_PASSWORD_HOM: 'secret',
    })
    expect(config.oracle?.profiles.HOM?.username).toBe('app_hom')
    expect(config.oracle?.profiles.DEV).toBeUndefined()
    expect(config.configurationIssues.oracle).toContain('ORACLE_CONNECT_STRING_DEV')
  })

  it('runs SELECT with bind values in a READ ONLY transaction and uses an alternate user with the same password', async () => {
    const { connection, execute } = makeConnection([{ metaData: [{ name: 'ID' }], rows: [{ ID: 7 }] }])
    const getConnection = vi.spyOn(oracledb, 'getConnection').mockResolvedValue(connection as never)
    const config = loadConfig(fullOracleEnv).oracle
    if (!config) throw new Error('Oracle config expected')
    const client = new OracleClient(config)

    const result = await client.query('SELECT ID FROM USERS WHERE ID = :id', { id: 7 }, 20, { environment: 'DEV', username: 'audit_user' })

    expect(result).toMatchObject({ columns: ['ID'], rows: [{ ID: 7 }], returnedRows: 1, truncated: false })
    expect(getConnection).toHaveBeenCalledWith({ user: 'audit_user', password: 'dev-secret', connectString: 'db-dev.example:1521/SARAH' })
    expect(execute.mock.calls.map(call => call[0])).toEqual(['SET TRANSACTION READ ONLY', 'SELECT ID FROM USERS WHERE ID = :id'])
    expect(execute.mock.calls[1]?.[1]).toEqual({ id: 7 })
    expect(connection.rollback).toHaveBeenCalledOnce()
    expect(connection.close).toHaveBeenCalledOnce()
  })

  it('passes the TNS configuration directory when the profile uses an alias', async () => {
    const { connection } = makeConnection([{ rows: [{ CONNECTED: 1 }] }])
    const getConnection = vi.spyOn(oracledb, 'getConnection').mockResolvedValue(connection as never)
    const config = loadConfig({
      ORACLE_CONNECT_STRING_DEV: 'BSBDSV',
      ORACLE_USER_DEV: 'app_dev',
      ORACLE_PASSWORD_DEV: 'secret',
      ORACLE_TNS_ADMIN_DEV: 'C:\\oracle\\network\\admin',
    }, 'C:\\repo').oracle
    if (!config) throw new Error('Oracle config expected')

    await new OracleClient(config).healthCheck()

    expect(getConnection).toHaveBeenCalledWith({
      user: 'app_dev',
      password: 'secret',
      connectString: 'BSBDSV',
      configDir: 'C:\\oracle\\network\\admin',
    })
  })

  it('initializes Thick mode once with the configured client and TNS directories', async () => {
    const { connection } = makeConnection([{ rows: [{ CONNECTED: 1 }] }, { rows: [{ CONNECTED: 1 }] }])
    const initOracleClient = vi.spyOn(oracledb, 'initOracleClient').mockImplementation(() => undefined)
    vi.spyOn(oracledb, 'getConnection').mockResolvedValue(connection as never)
    const config = loadConfig({
      ORACLE_CONNECT_STRING_DEV: 'BSBDSV',
      ORACLE_USER_DEV: 'app_dev',
      ORACLE_PASSWORD_DEV: 'secret',
      ORACLE_TNS_ADMIN_DEV: 'C:\\oracle\\network\\admin',
      ORACLE_CLIENT_LIB_DIR: 'C:\\oracle\\instantclient_19_17',
    }, 'C:\\repo').oracle
    if (!config) throw new Error('Oracle config expected')
    const client = new OracleClient(config)

    await client.healthCheck()
    await client.healthCheck()

    expect(initOracleClient).toHaveBeenCalledOnce()
    expect(initOracleClient).toHaveBeenCalledWith({
      libDir: 'C:\\oracle\\instantclient_19_17',
      configDir: 'C:\\oracle\\network\\admin',
    })
  })

  it('rejects non-SELECT and multiple statements before connecting', async () => {
    const getConnection = vi.spyOn(oracledb, 'getConnection')
    const config = loadConfig(fullOracleEnv).oracle
    if (!config) throw new Error('Oracle config expected')
    const client = new OracleClient(config)

    await expect(client.query('DELETE FROM USERS', {}, 10, { environment: 'DEV' })).rejects.toMatchObject({ code: 'POLICY_DENIED' })
    await expect(client.query('SELECT 1 FROM DUAL; DELETE FROM USERS', {}, 10, { environment: 'DEV' })).rejects.toMatchObject({ code: 'POLICY_DENIED' })
    expect(getConnection).not.toHaveBeenCalled()
  })

  it('reads table columns and uses validated metadata bind variables', async () => {
    const { connection, execute } = makeConnection([{ rows: [{ COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER' }] }])
    vi.spyOn(oracledb, 'getConnection').mockResolvedValue(connection as never)
    const config = loadConfig(fullOracleEnv).oracle
    if (!config) throw new Error('Oracle config expected')
    const result = await new OracleClient(config).describeTable(undefined, 'users', { environment: 'DEV' })

    expect(result).toMatchObject({ owner: 'APP_DEV', table: 'USERS', columns: [{ COLUMN_NAME: 'ID' }] })
    expect(execute.mock.calls[1]?.[1]).toEqual({ owner: 'APP_DEV', tableName: 'USERS' })
  })

  it('invokes a unique scalar package function using named binds', async () => {
    const { connection, execute } = makeConnection([
      { rows: [{ FUNCTION_NAME: 'GET_TOTAL', OVERLOAD: null, SUBPROGRAM_ID: 1 }] },
      { rows: [
        { ARGUMENT_NAME: null, POSITION: 0, DATA_TYPE: 'NUMBER', IN_OUT: 'OUT' },
        { ARGUMENT_NAME: 'P_ID', POSITION: 1, DATA_TYPE: 'NUMBER', IN_OUT: 'IN', DEFAULTED: 'N' },
      ] },
      { metaData: [{ name: 'RESULT' }], rows: [{ RESULT: 42 }] },
    ])
    vi.spyOn(oracledb, 'getConnection').mockResolvedValue(connection as never)
    const config = loadConfig(fullOracleEnv).oracle
    if (!config) throw new Error('Oracle config expected')
    const result = await new OracleClient(config).callPackageFunction('billing', 'totals_pkg', 'get_total', { p_id: 9 }, { environment: 'DEV' })

    expect(result.rows).toEqual([{ RESULT: 42 }])
    expect(execute.mock.calls[3]?.[0]).toBe('SELECT "BILLING"."TOTALS_PKG"."GET_TOTAL"("P_ID" => :arg1) AS RESULT FROM DUAL')
    expect(execute.mock.calls[3]?.[1]).toEqual({ arg1: 9 })
  })

  it('refuses functions with OUT parameters', async () => {
    const { connection } = makeConnection([
      { rows: [{ FUNCTION_NAME: 'GET_TOTAL', OVERLOAD: null, SUBPROGRAM_ID: 1 }] },
      { rows: [{ ARGUMENT_NAME: 'P_RESULT', POSITION: 1, DATA_TYPE: 'NUMBER', IN_OUT: 'OUT' }] },
    ])
    vi.spyOn(oracledb, 'getConnection').mockResolvedValue(connection as never)
    const config = loadConfig(fullOracleEnv).oracle
    if (!config) throw new Error('Oracle config expected')
    await expect(new OracleClient(config).callPackageFunction('BILLING', 'TOTALS_PKG', 'GET_TOTAL', {}, { environment: 'DEV' })).rejects.toMatchObject({ code: 'POLICY_DENIED' })
  })

  it('blocks package functions outside a non-empty allowlist', async () => {
    const getConnection = vi.spyOn(oracledb, 'getConnection')
    const config = loadConfig({
      ORACLE_CONNECT_STRING_DEV: 'db-dev.example:1521/SARAH',
      ORACLE_USER_DEV: 'app_dev',
      ORACLE_PASSWORD_DEV: 'dev-secret',
      ORACLE_READONLY_FUNCTIONS_DEV: 'BILLING.OTHER_PKG.OTHER_FUNCTION',
    }).oracle
    if (!config) throw new Error('Oracle config expected')
    await expect(new OracleClient(config).callPackageFunction('BILLING', 'TOTALS_PKG', 'GET_TOTAL', {}, { environment: 'DEV' })).rejects.toMatchObject({ code: 'POLICY_DENIED' })
    expect(getConnection).not.toHaveBeenCalled()
  })

  it('does not fall back from an unconfigured DEV profile', async () => {
    const config = loadConfig({
      ORACLE_CONNECT_STRING_PRO: 'db-pro.example:1521/SARAH',
      ORACLE_USER_PRO: 'app_pro',
      ORACLE_PASSWORD_PRO: 'pro-secret',
    }).oracle
    if (!config) throw new Error('Oracle config expected')
    await expect(new OracleClient(config).healthCheck('DEV')).rejects.toMatchObject({ code: 'CONFIG_MISSING' })
  })
})

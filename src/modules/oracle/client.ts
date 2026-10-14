import oracledb from 'oracledb'
import type { OracleConfig, OracleEnvironment, OracleProfileConfig } from '../../core/config.js'
import { AppError } from '../../core/errors.js'

export type OracleScalar = string | number | boolean | null
export type OracleRow = Record<string, unknown>

export interface OracleCallOptions {
  environment: OracleEnvironment
  username?: string
}

export interface OracleQueryResult {
  columns: string[]
  rows: OracleRow[]
  returnedRows: number
  truncated: boolean
}

interface OracleExecutionResult {
  metaData?: Array<{ name: string }>
  rows?: OracleRow[]
}

const identifierPattern = /^[A-Za-z][A-Za-z0-9_$#]{0,127}$/

function identifier(value: string, label: string): string {
  const trimmed = value.trim()
  if (!identifierPattern.test(trimmed)) throw new AppError('POLICY_DENIED', `${label} deve ser um identificador Oracle simples.`)
  return trimmed.toUpperCase()
}

function isScalar(value: unknown): value is OracleScalar {
  return value === null || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean'
}

function queryResult(result: OracleExecutionResult, maxRows: number): OracleQueryResult {
  const rows = (result.rows ?? []).slice(0, maxRows)
  return {
    columns: (result.metaData ?? []).map(column => column.name),
    rows,
    returnedRows: rows.length,
    truncated: (result.rows?.length ?? 0) > maxRows,
  }
}

export class OracleClient {
  #clientInitialized = false

  constructor(readonly config: OracleConfig, readonly requestTimeoutMs = 30_000) {}

  configuredEnvironments(): OracleEnvironment[] {
    return (['DEV', 'HOM', 'PRO'] as const).filter(environment => this.config.profiles[environment] !== undefined)
  }

  async healthCheck(environment: OracleEnvironment = 'DEV'): Promise<void> {
    await this.#withConnection({ environment }, async connection => {
      await connection.execute('SELECT 1 AS CONNECTED FROM DUAL', {}, { maxRows: 1 })
    })
  }

  async query(sql: string, binds: Record<string, OracleScalar>, maxRows: number, options: OracleCallOptions): Promise<OracleQueryResult> {
    const normalizedSql = sql.trim()
    if (!/^SELECT\b/i.test(normalizedSql) || normalizedSql.includes(';') || /\bFOR\s+UPDATE\b/i.test(normalizedSql)) {
      throw new AppError('POLICY_DENIED', 'A consulta aceita somente uma instrução SELECT, sem ponto e vírgula. DML, DDL e PL/SQL não são permitidos.')
    }
    for (const [name, value] of Object.entries(binds)) {
      if (!identifierPattern.test(name) || !isScalar(value)) throw new AppError('POLICY_DENIED', 'Binds devem usar nomes simples e valores escalares (texto, número, booleano ou nulo).')
    }
    return this.#withConnection(options, async connection => {
      const result = await connection.execute(normalizedSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: maxRows + 1 }) as OracleExecutionResult
      return queryResult(result, maxRows)
    })
  }

  async describeTable(ownerInput: string | undefined, tableInput: string, options: OracleCallOptions): Promise<{ owner: string; table: string; columns: OracleRow[] }> {
    const table = identifier(tableInput, 'table')
    return this.#withConnection(options, async (connection, profile) => {
      const owner = identifier(ownerInput ?? options.username ?? profile.username, 'owner')
      const result = await connection.execute(
        `SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, DATA_DEFAULT
         FROM ALL_TAB_COLUMNS WHERE OWNER = :owner AND TABLE_NAME = :tableName ORDER BY COLUMN_ID`,
        { owner, tableName: table },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 1_000 },
      ) as OracleExecutionResult
      const columns = result.rows ?? []
      if (columns.length === 0) throw new AppError('NOT_FOUND', `Tabela ${owner}.${table} não encontrada ou sem metadados visíveis para este usuário.`)
      return { owner, table, columns }
    })
  }

  async listPackageFunctions(ownerInput: string | undefined, packageInput: string, options: OracleCallOptions): Promise<{ owner: string; packageName: string; functions: OracleRow[] }> {
    const packageName = identifier(packageInput, 'packageName')
    return this.#withConnection(options, async (connection, profile) => {
      const owner = identifier(ownerInput ?? options.username ?? profile.username, 'owner')
      const result = await connection.execute(
        `SELECT PROCEDURE_NAME AS FUNCTION_NAME, OVERLOAD, SUBPROGRAM_ID
         FROM ALL_PROCEDURES
         WHERE OWNER = :owner AND OBJECT_NAME = :packageName AND PROCEDURE_TYPE = 'FUNCTION'
         ORDER BY PROCEDURE_NAME, SUBPROGRAM_ID`,
        { owner, packageName },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 500 },
      ) as OracleExecutionResult
      const functions = result.rows ?? []
      if (functions.length === 0) throw new AppError('NOT_FOUND', `Package ${owner}.${packageName} não encontrado ou sem funções visíveis para este usuário.`)
      const details = await Promise.all(functions.map(async (fn) => {
        const functionName = String(fn.FUNCTION_NAME)
        const args = await connection.execute(
          `SELECT ARGUMENT_NAME, POSITION, SEQUENCE, DATA_TYPE, IN_OUT, DEFAULTED
           FROM ALL_ARGUMENTS
           WHERE OWNER = :owner AND PACKAGE_NAME = :packageName AND OBJECT_NAME = :functionName AND NVL(OVERLOAD, '0') = NVL(:overload, '0') AND DATA_LEVEL = 0
           ORDER BY SEQUENCE`,
          { owner, packageName, functionName, overload: typeof fn.OVERLOAD === 'string' ? fn.OVERLOAD : null },
          { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 100 },
        ) as OracleExecutionResult
        return { ...fn, arguments: args.rows ?? [] }
      }))
      return { owner, packageName, functions: details }
    })
  }

  async callPackageFunction(
    ownerInput: string | undefined,
    packageInput: string,
    functionInput: string,
    args: Record<string, OracleScalar>,
    options: OracleCallOptions,
  ): Promise<OracleQueryResult> {
    const packageName = identifier(packageInput, 'packageName')
    const functionName = identifier(functionInput, 'functionName')
    const profile = this.config.profiles[options.environment]
    if (!profile) throw new AppError('CONFIG_MISSING', `O ambiente Oracle ${options.environment} não está configurado.`)
    const owner = identifier(ownerInput ?? options.username ?? profile.username, 'owner')
    if (profile.readonlyFunctions.length > 0 && !profile.readonlyFunctions.includes(`${owner}.${packageName}.${functionName}`)) {
      throw new AppError('POLICY_DENIED', `A função ${owner}.${packageName}.${functionName} não está aprovada na allowlist de leitura deste ambiente.`)
    }
    return this.#withConnection(options, async connection => {
      const routines = await connection.execute(
        `SELECT PROCEDURE_NAME AS FUNCTION_NAME, OVERLOAD, SUBPROGRAM_ID
         FROM ALL_PROCEDURES
         WHERE OWNER = :owner AND OBJECT_NAME = :packageName AND PROCEDURE_NAME = :functionName AND PROCEDURE_TYPE = 'FUNCTION'`,
        { owner, packageName, functionName },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 2 },
      ) as OracleExecutionResult
      if ((routines.rows ?? []).length !== 1) throw new AppError('POLICY_DENIED', 'A função não foi encontrada de forma única. Consulte as funções disponíveis; funções sobrecarregadas não podem ser executadas por esta ferramenta.')

      const metadata = await connection.execute(
        `SELECT ARGUMENT_NAME, POSITION, SEQUENCE, DATA_TYPE, IN_OUT, DEFAULTED
         FROM ALL_ARGUMENTS
         WHERE OWNER = :owner AND PACKAGE_NAME = :packageName AND OBJECT_NAME = :functionName AND DATA_LEVEL = 0
         ORDER BY SEQUENCE`,
        { owner, packageName, functionName },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 100 },
      ) as OracleExecutionResult
      const parameters = (metadata.rows ?? []).filter(row => Number(row.POSITION) > 0)
      const returnType = (metadata.rows ?? []).find(row => Number(row.POSITION) === 0)?.DATA_TYPE
      if (typeof returnType === 'string' && !isSupportedScalarType(returnType)) throw new AppError('POLICY_DENIED', 'A função não retorna um tipo escalar compatível e não pode ser chamada por esta ferramenta.')
      if ((metadata.rows ?? []).some(row => Number(row.POSITION) > 0 && (row.IN_OUT !== 'IN' || typeof row.DATA_TYPE !== 'string' || !isSupportedScalarType(row.DATA_TYPE)))) {
        throw new AppError('POLICY_DENIED', 'A função possui parâmetros OUT/IN OUT ou tipos não escalares e não pode ser chamada por esta ferramenta.')
      }

      const supplied = new Map(Object.entries(args).map(([name, value]) => [identifier(name, 'argumento'), value]))
      const sqlArguments: string[] = []
      const binds: Record<string, OracleScalar> = {}
      for (const parameter of parameters) {
        const argumentName = parameter.ARGUMENT_NAME
        if (typeof argumentName !== 'string' || !argumentName) throw new AppError('POLICY_DENIED', 'A função possui argumento sem nome e não pode ser chamada com segurança.')
        const name = argumentName.toUpperCase()
        const bindName = `arg${Number(parameter.POSITION)}`
        if (supplied.has(name)) {
          const value = supplied.get(name)
          if (!isScalar(value)) throw new AppError('POLICY_DENIED', `O argumento ${name} deve ser escalar.`)
          binds[bindName] = value
          sqlArguments.push(`"${name}" => :${bindName}`)
          supplied.delete(name)
        } else if (parameter.DEFAULTED !== 'Y') {
          throw new AppError('POLICY_DENIED', `O argumento obrigatório ${name} não foi informado.`)
        }
      }
      if (supplied.size > 0) throw new AppError('POLICY_DENIED', `Argumento(s) não reconhecido(s): ${[...supplied.keys()].join(', ')}.`)

      const sql = `SELECT "${owner}"."${packageName}"."${functionName}"(${sqlArguments.join(', ')}) AS RESULT FROM DUAL`
      const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 1 }) as OracleExecutionResult
      return queryResult(result, 1)
    })
  }

  async #withConnection<T>(options: OracleCallOptions, action: (connection: oracledb.Connection, profile: OracleProfileConfig) => Promise<T>): Promise<T> {
    const profile = this.config.profiles[options.environment]
    if (!profile) throw new AppError('CONFIG_MISSING', `O ambiente Oracle ${options.environment} não está configurado.`)
    const username = options.username?.trim() || profile.username
    if (!identifierPattern.test(username)) throw new AppError('POLICY_DENIED', 'O usuário Oracle deve ser um identificador simples.')
    let connection: oracledb.Connection | undefined
    try {
      if (this.config.clientLibDir && !this.#clientInitialized) {
        oracledb.initOracleClient({
          libDir: this.config.clientLibDir,
          configDir: this.config.clientConfigDir ?? this.config.profiles.DEV?.tnsAdmin ?? profile.tnsAdmin,
        })
        this.#clientInitialized = true
      }
      connection = await oracledb.getConnection({
        user: username,
        password: profile.password,
        connectString: profile.connectString,
        ...(profile.tnsAdmin ? { configDir: profile.tnsAdmin } : {}),
      })
      connection.callTimeout = this.requestTimeoutMs
      await connection.execute('SET TRANSACTION READ ONLY')
      return await action(connection, profile)
    } finally {
      if (connection) {
        try { await connection.rollback() } catch { /* A conexão ainda será fechada. */ }
        try { await connection.close() } catch { /* Não exponha detalhes sensíveis do driver. */ }
      }
    }
  }
}

function isSupportedScalarType(type: string): boolean {
  return /^(VARCHAR2?|NVARCHAR2?|CHAR|NCHAR|NUMBER|BINARY_FLOAT|BINARY_DOUBLE|DATE|TIMESTAMP(?:\([0-9]+\))?(?: WITH (?:LOCAL )?TIME ZONE)?|BOOLEAN)$/i.test(type)
}

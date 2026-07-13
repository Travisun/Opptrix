import duckdb from 'duckdb'

export type DuckConnection = duckdb.Connection

export function openDuckDatabase(dbPath: string, readOnly = false): duckdb.Database {
  return new duckdb.Database(dbPath, readOnly ? duckdb.OPEN_READONLY : undefined)
}

export function connectDuck(db: duckdb.Database): DuckConnection {
  return db.connect()
}

export function duckRun(conn: DuckConnection, sql: string, ...params: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.run(sql, ...params, (err: Error | null) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export function duckAll<T extends Record<string, unknown>>(
  conn: DuckConnection,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, ...params, (err: Error | null, rows: unknown) => {
      if (err) reject(err)
      else resolve((rows ?? []) as T[])
    })
  })
}

export function duckGet<T extends Record<string, unknown>>(
  conn: DuckConnection,
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  return duckAll<T>(conn, sql, ...params).then(rows => rows[0])
}

export function closeDuck(db: duckdb.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err: Error | null) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/** DuckDB ATTACH 不支持 ? 占位符，须内联转义路径 */
export function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export async function attachSqlite(
  conn: DuckConnection,
  sqlitePath: string,
  alias = 'md',
  readOnly = false,
): Promise<void> {
  await duckRun(conn, `INSTALL sqlite; LOAD sqlite;`)
  const ro = readOnly ? ', READ_ONLY true' : ''
  await duckRun(conn, `ATTACH ${sqlStringLiteral(sqlitePath)} AS ${alias} (TYPE SQLITE${ro})`)
}

export async function detachSqlite(conn: DuckConnection, alias = 'md'): Promise<void> {
  await duckRun(conn, `DETACH ${alias}`)
}

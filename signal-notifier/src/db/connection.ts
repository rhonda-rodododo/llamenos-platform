import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

let _sql: ReturnType<typeof postgres> | null = null
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getConnection(databaseUrl: string) {
  if (!_sql) {
    _sql = postgres(databaseUrl, { max: 5 })
    _db = drizzle(_sql, { schema })
  }
  return { sql: _sql, db: _db! }
}

export function createConnection(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 5 })
  const db = drizzle(sql, { schema })
  return { sql, db }
}

export type Db = ReturnType<typeof drizzle<typeof schema>>

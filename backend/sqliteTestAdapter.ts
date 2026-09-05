import { DatabaseSync } from 'node:sqlite'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import type { VaultDatabase, VaultStatement } from './worker'

/** Uses actual SQLite SQL execution behind the small D1 interface. Test only. */
export function createTestDatabase() {
  const sqlite = new DatabaseSync(':memory:')
  const migrationDirectory = new URL('./drizzle/', import.meta.url)
  const migrations = existsSync(migrationDirectory)
    ? readdirSync(migrationDirectory).filter(file => file.endsWith('.sql')).sort()
    : []
  const schemaFiles = migrations.length
    ? migrations.map(file => new URL(file, migrationDirectory))
    : [new URL('./schema.sql', import.meta.url)]
  for (const schemaFile of schemaFiles) sqlite.exec(readFileSync(schemaFile, 'utf8'))
  const DB: VaultDatabase = {
    prepare(query) {
      let parameters: (string | number | null)[] = []
      const statement: VaultStatement = {
        bind(...values) { parameters = values; return statement },
        async first<T>() { return (sqlite.prepare(query).get(...parameters) ?? null) as T | null },
        async run() { return { meta: { changes: Number(sqlite.prepare(query).run(...parameters).changes) } } },
      }
      return statement
    },
  }
  return { DB, sqlite, schemaFiles }
}

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

// Exported so tests can open a throwaway ':memory:' db through the same pragma + migrate path.
export function createDb(file = 'data/estate.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  // SQLite defaults this OFF; cascading deletes silently no-op without it.
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  // Migrate on construction, so a fresh clone (and `pnpm dev`) just works.
  migrate(db, { migrationsFolder: 'drizzle' })
  return db
}

// better-sqlite3 is synchronous; one connection per process is correct.
export const db = createDb()

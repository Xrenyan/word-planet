import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core'
export const vaults = sqliteTable('vaults', {
  id: text('id').primaryKey(), secretHash: text('secret_hash').notNull(),
  iv: text('iv').notNull(), ciphertext: text('ciphertext').notNull(),
  revision: integer('revision').notNull().default(1), updatedAt: integer('updated_at').notNull(), expiresAt: integer('expires_at').notNull(),
}, table => [index('vaults_expiry').on(table.expiresAt), check('positive_revision', sql`${table.revision} > 0`)])
export const rateLimits = sqliteTable('vault_rate_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), resetAt: integer('reset_at').notNull(),
}, table => [index('vault_rate_limits_expiry').on(table.resetAt), check('positive_count', sql`${table.count} > 0`)])

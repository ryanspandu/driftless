import { existsSync, readdirSync } from 'node:fs'
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

/**
 * Each module owns its schema under `modules/<name>/migrations`. Discover those
 * folders at config-load time so module migrations run alongside the core ones.
 */
/** Each module owns its schema under `modules/<name>/migrations` (same pattern). */
function moduleMigrationPaths(): string[] {
  // Matches the override in `modules/registry.ts`, so a test that points
  // discovery at a fixture directory gets its migrations too.
  const dir = env.get('DRIFTLESS_MODULES_DIR') ?? 'modules'

  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`${dir}/${d.name}/migrations`))
    .map((d) => `${dir}/${d.name}/migrations`)
}

const migrationPaths = [
  'database/migrations',
  ...moduleMigrationPaths(),
]

const dbConfig = defineConfig({
  connection: env.get('NODE_ENV') === 'test' ? 'sqlite' : 'pg',

  connections: {
    pg: {
      client: 'pg',
      connection: {
        connectionString: env.get('DATABASE_URL'),
      },
      migrations: {
        naturalSort: true,
        paths: migrationPaths,
      },
      debug: app.inDev,
    },

    sqlite: {
      client: 'better-sqlite3',
      connection: {
        filename: app.tmpPath('db.sqlite3'),
      },
      useNullAsDefault: true,
      migrations: {
        naturalSort: true,
        paths: migrationPaths,
      },
    },
  },
})

export default dbConfig

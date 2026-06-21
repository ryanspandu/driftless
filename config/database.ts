import { existsSync, readdirSync } from 'node:fs'
import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig } from '@adonisjs/lucid'

/**
 * Each plugin owns its schema under `plugins/<name>/migrations`. Discover those
 * folders at config-load time so plugin migrations run alongside the core ones.
 */
function pluginMigrationPaths(): string[] {
  if (!existsSync('plugins')) return []
  return readdirSync('plugins', { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`plugins/${d.name}/migrations`))
    .map((d) => `plugins/${d.name}/migrations`)
}

const migrationPaths = ['database/migrations', ...pluginMigrationPaths()]

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

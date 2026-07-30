import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Role from '#models/role'
import Permission from '#models/permission'
import SchemaInstallerService from '#services/schema_installer_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

/**
 * A user whose rights come from the seeded ADMIN role and nothing else.
 *
 * ADMIN holds `module:install` — installing is something an operator does — but
 * **not** `module:uninstall`, which drops tables with no undo.
 */
async function adminRoleUser() {
  const role = await Role.query().where('name', 'ADMIN').firstOrFail()
  const user = await User.create({
    email: `operator-${Date.now()}@example.com`,
    password: 'password123',
    username: `operator${Date.now()}`,
    status: 'ACTIVE',
  })
  await user.related('roles').attach([role.id])
  return user
}

test.group('Schema installer', (group) => {
  group.each.setup(async () => resetDatabase())

  test('reports pending migrations with their origin', async ({ client, assert }) => {
    const admin = await adminUser()
    const res = await client.get('/api/admin/schema/pending').loginAs(admin)

    res.assertStatus(200)
    assert.isNumber(res.body().total)
    assert.isArray(res.body().migrations)

    // The suite migrates fully before running, so nothing should be pending.
    assert.equal(res.body().total, 0)
  })

  test('installing when nothing is pending is a no-op, not an error', async ({
    client,
    assert,
  }) => {
    const admin = await adminUser()
    const res = await client.post('/api/admin/schema/install').loginAs(admin).json({})

    res.assertStatus(200)
    assert.deepEqual(res.body().applied, [])
  })

  test('running install twice leaves the connection usable', async ({ client, assert }) => {
    const admin = await adminUser()

    await client.post('/api/admin/schema/install').loginAs(admin).json({})
    await client.post('/api/admin/schema/install').loginAs(admin).json({})

    /**
     * Regression guard for the sharpest edge in Lucid's migrator:
     * `migrator.close()` calls `db.manager.closeAll(true)`, which deregisters
     * every connection and makes every later query throw
     * `E_UNMANAGED_DB_CONNECTION` until the process restarts. The installer must
     * never call it.
     */
    const row = await db.from('users').select('id').first()
    assert.isNotNull(row)

    const stillWorks = await client.get('/api/me').loginAs(admin)
    stillWorks.assertStatus(200)
  })

  test('refuses when the named owner has no pending migrations', async ({ client }) => {
    const admin = await adminUser()

    /**
     * Guards the silent-success case: if `config/database.ts` resolved its
     * migration paths against a different CWD than `MigrationSource` uses, the
     * path list is empty and `run()` succeeds having done nothing.
     */
    const res = await client
      .post('/api/admin/schema/install')
      .loginAs(admin)
      .json({ expectOwner: 'not-a-real-module' })

    res.assertStatus(422)
    res.assertBodyContains({ reason: 'owner_migrations_not_found' })
  })

  test('ADMIN may install but may not uninstall', async ({ client, assert }) => {
    const operator = await adminRoleUser()

    // Confirm the premise: both codes are seeded and distinct.
    const perms = await Permission.query().whereIn('name', ['module:install', 'module:uninstall'])
    assert.lengthOf(perms, 2, 'the permissions should be seeded')

    const pending = await client.get('/api/admin/schema/pending').loginAs(operator)
    pending.assertStatus(200)

    const install = await client.post('/api/admin/schema/install').loginAs(operator).json({})
    install.assertStatus(200)

    /**
     * The line that stays drawn. Installing is recoverable — a bad module is
     * disabled, a bad release rolls back. Uninstalling drops tables and there
     * is no undo, so it stays with SUPERADMIN's `*`.
     */
    const uninstall = await client
      .post('/api/admin/modules/tasks/uninstall')
      .loginAs(operator)
      .json({ confirm: 'tasks' })
    uninstall.assertStatus(403)
  })

  test('installing is capped per user', async ({ client }) => {
    const operator = await adminRoleUser()

    /**
     * `module:install` is held by every ADMIN and it runs a build on the
     * server, so the cap is a security control rather than politeness: it is
     * what bounds the damage one compromised admin account can do.
     */
    for (let attempt = 0; attempt < 3; attempt++) {
      const ok = await client.post('/api/admin/schema/install').loginAs(operator).json({})
      ok.assertStatus(200)
    }

    const fourth = await client.post('/api/admin/schema/install').loginAs(operator).json({})
    fourth.assertStatus(429)
  })

  test('rejects unauthenticated callers', async ({ client }) => {
    const pending = await client.get('/api/admin/schema/pending')
    pending.assertStatus(401)

    const install = await client.post('/api/admin/schema/install').json({})
    install.assertStatus(401)
  })

  test('uninstall requires the typed name to match', async ({ client }) => {
    const admin = await adminUser()

    const res = await client
      .post('/api/admin/modules/tasks/uninstall')
      .loginAs(admin)
      .json({ confirm: 'wrong-name' })

    res.assertStatus(422)
    res.assertBodyContains({ reason: 'confirmation_mismatch' })
  })

  test('uninstall refuses a module that declares no tables', async ({ client }) => {
    const admin = await adminUser()

    // `tasks` predates the `tables` manifest field, so it cannot be dropped
    // automatically — there is no safe list of what belongs to it.
    const res = await client
      .post('/api/admin/modules/tasks/uninstall')
      .loginAs(admin)
      .json({ confirm: 'tasks' })

    res.assertStatus(422)
    res.assertBodyContains({ reason: 'uninstall_refused' })
  })

  test('tablesReady is honest about what exists', async ({ assert }) => {
    const installer = new SchemaInstallerService()

    assert.isTrue(await installer.tablesReady([]), 'no declared tables means ready')
    assert.isTrue(await installer.tablesReady(['users']))
    assert.isFalse(await installer.tablesReady(['users', 'definitely_not_a_table']))
  })
})

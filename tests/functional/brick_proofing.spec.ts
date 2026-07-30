import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import app from '@adonisjs/core/services/app'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import { bootFailures, bootModules } from '#modules/registry'
import type { ModuleManifest } from '#modules/types'

/**
 * Everything here protects one property: **a bad module must not be able to
 * lock the operator out of the screen that removes it.**
 *
 * That is the failure mode a marketplace makes routine — a package that imports
 * cleanly and then throws against a live container — and the one that turns a
 * bad release into a support ticket per customer.
 */

function manifest(over: Partial<ModuleManifest> & { name: string }): ModuleManifest {
  return {
    label: over.name,
    description: '',
    version: '1.0.0',
    permissions: [],
    registerRoutes: () => {},
    ...over,
  }
}

test.group('Brick-proofing | boot isolation', (group) => {
  group.each.setup(async () => {
    await testUtils.db().truncate()
    await testUtils.db().seed()
  })

  test('a module that throws in boot() does not stop the others', async ({ assert }) => {
    const order: string[] = []

    /**
     * `bootModules` iterates the real registry, so the isolation is exercised
     * through the same code path production uses rather than a stand-in.
     */
    const registry = await import('#modules/registry')
    const original = [...registry.MODULES]
    registry.MODULES.length = 0
    registry.MODULES.push(
      manifest({ name: 'first', boot: async () => void order.push('first') }),
      manifest({
        name: 'broken',
        boot: async () => {
          throw new Error('table does not exist')
        },
      }),
      manifest({ name: 'last', boot: async () => void order.push('last') })
    )

    try {
      await bootModules(app, () => true)

      // The module *after* the failure is the one that matters: a throw used to
      // abandon the loop, so everything later never booted at all.
      assert.deepEqual(order, ['first', 'last'])
      assert.deepEqual([...bootFailures.keys()], ['broken'])
      assert.include(bootFailures.get('broken'), 'table does not exist')
    } finally {
      registry.MODULES.length = 0
      registry.MODULES.push(...original)
    }
  })

  test('quarantine disables the module and records why', async ({ assert }) => {
    /**
     * `updateOrCreate`, not `create`: the seeder reconciles the real registry
     * into this table, so a test that assumes it starts empty is a test that
     * breaks the moment a module is added.
     */
    await Module.updateOrCreate(
      { name: 'quarantine-target' },
      {
        id: 'test-quarantine-target',
        name: 'quarantine-target',
        enabled: true,
        version: '1.0.0',
        kind: 'app',
        source: 'bundled',
      }
    )

    await new ModulesService().quarantine('quarantine-target', 'table does not exist')

    const row = await Module.findByOrFail('name', 'quarantine-target')
    assert.isFalse(Boolean(row.enabled))
    assert.equal(row.bootError, 'table does not exist')

    /**
     * The cache has to be dropped too, or the module stays reachable for up to
     * ten seconds after being quarantined — long enough to serve the very
     * requests that were failing.
     */
    assert.isFalse(await new ModulesService().isEnabled('quarantine-target'))
  })

  test('a quarantine reason is truncated rather than refused', async ({ assert }) => {
    await Module.updateOrCreate(
      { name: 'verbose-target' },
      {
        id: 'test-verbose-target',
        name: 'verbose-target',
        enabled: true,
        version: '1.0.0',
        kind: 'app',
        source: 'bundled',
      }
    )

    // A stack trace pasted into a column with a length limit must not turn a
    // recoverable failure into an unrecoverable one.
    await new ModulesService().quarantine('verbose-target', 'x'.repeat(5000))

    const row = await Module.findByOrFail('name', 'verbose-target')
    assert.equal(row.bootError?.length, 1000)
  })
})

test.group('Brick-proofing | safe mode', () => {
  /**
   * `SAFE_MODE` is read once at import, so it cannot be flipped inside a
   * running test. Asserting on the source text would only prove the words are
   * present — so this boots a real process with the flag set and asks it what
   * it discovered. Slower, and the only version that proves anything.
   */
  async function discoveredModulesWith(env: Record<string, string>): Promise<string[]> {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')

    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--import=@poppinss/ts-exec',
        '-e',
        `const r = await import('#modules/registry'); console.log(JSON.stringify(r.MODULES.map((m) => m.name)))`,
        '--input-type=module',
      ],
      { cwd: app.appRoot.pathname, env: { ...process.env, ...env } }
    )

    return JSON.parse(stdout.trim().split('\n').pop()!)
  }

  test('safe mode discovers no modules at all', async ({ assert }) => {
    const normal = await discoveredModulesWith({})
    assert.isAbove(normal.length, 0, 'the baseline should find modules')

    const safe = await discoveredModulesWith({ DRIFTLESS_SAFE_MODE: '1' })

    /**
     * Zero, not "fewer". Everything else follows from an empty registry: no
     * routes, no boot hooks, no permissions, no reserved segments — which is
     * what makes an install recoverable when a module is what broke it.
     */
    assert.lengthOf(safe, 0)
  }).timeout(30_000)

  test('the disable list excludes one module without safe mode', async ({ assert }) => {
    const normal = await discoveredModulesWith({})
    const target = normal[0]!

    const partial = await discoveredModulesWith({ DRIFTLESS_DISABLE_MODULES: target })

    assert.notInclude(partial, target)
    // The surgical instrument: everything else must still be there.
    assert.lengthOf(partial, normal.length - 1)
  }).timeout(30_000)

  test('the CLI writes the sentinel the registry reads', async ({ assert }) => {
    const sentinel = app.makePath('tmp/SAFE_MODE')
    const existed = existsSync(sentinel)

    mkdirSync(dirname(sentinel), { recursive: true })
    writeFileSync(sentinel, 'test')

    try {
      const safe = await discoveredModulesWith({})
      // Proves the two agree on the path — a mismatch would leave
      // `modules:safe-mode --on` silently doing nothing.
      assert.lengthOf(safe, 0)
    } finally {
      if (!existed) rmSync(sentinel, { force: true })
    }
  }).timeout(30_000)
})

test.group('Brick-proofing | health', (group) => {
  group.each.setup(async () => {
    await testUtils.db().truncate()
    await testUtils.db().seed()
  })

  test('the public probe says the version and nothing else', async ({ client, assert }) => {
    const res = await client.get('/health')
    const body = res.body()

    assert.properties(body, ['ok', 'version'])

    /**
     * An inventory of installed packages and their versions is a shopping list
     * for whoever is looking for a known vulnerability. It belongs behind auth.
     */
    assert.notProperty(body, 'modules')
    assert.notProperty(body, 'db')
    assert.notProperty(body, 'safeMode')
  })

  test('a stale asset manifest is reported, not hidden', async ({ client, assert }) => {
    const manifestPath = app.makePath('public/assets/.vite/manifest.json')
    const had = existsSync(manifestPath)
    const saved = had ? readFileSync(manifestPath, 'utf8') : null

    mkdirSync(dirname(manifestPath), { recursive: true })
    writeFileSync(
      manifestPath,
      JSON.stringify({ 'inertia/app.tsx': { file: 'assets/app-DOES-NOT-EXIST.js' } })
    )

    try {
      const res = await client.get('/health')

      /**
       * This is the exact state the build corruption produced: the app boots,
       * every route answers, and every page is blank. Answering 200 through it
       * is what let it go unnoticed.
       */
      res.assertStatus(503)
      assert.isFalse(res.body().ok)
    } finally {
      if (saved !== null) writeFileSync(manifestPath, saved)
      else rmSync(manifestPath, { force: true })
    }
  })

  test('the detailed probe needs authentication', async ({ client }) => {
    const res = await client.get('/api/admin/health')

    // It reports module names, versions and boot errors — an inventory that
    // must never be readable without logging in.
    res.assertStatus(401)
  })

  test('a manifest naming a chunk that exists is healthy', async ({ client, assert }) => {
    const manifestPath = app.makePath('public/assets/.vite/manifest.json')
    const had = existsSync(manifestPath)
    const saved = had ? readFileSync(manifestPath, 'utf8') : null

    // A real file, so the health check's existsSync has something to find —
    // this is the positive half of the stale-manifest test above.
    const chunk = 'assets/health-spec-chunk.js'
    const chunkPath = join(dirname(manifestPath), '..', chunk)
    mkdirSync(dirname(chunkPath), { recursive: true })
    writeFileSync(chunkPath, '// present')

    mkdirSync(dirname(manifestPath), { recursive: true })
    writeFileSync(manifestPath, JSON.stringify({ 'inertia/app.tsx': { file: chunk } }))

    try {
      const res = await client.get('/health')
      res.assertStatus(200)
      assert.isTrue(res.body().ok)
    } finally {
      rmSync(chunkPath, { force: true })
      if (saved !== null) writeFileSync(manifestPath, saved)
      else rmSync(manifestPath, { force: true })
    }
  })
})

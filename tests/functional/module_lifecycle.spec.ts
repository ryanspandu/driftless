import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Module from '#models/module'
import Permission from '#models/permission'
import ModulesService from '#services/modules_service'
import { MODULES } from '#modules/registry'
import type { ModuleManifest } from '#modules/types'

/**
 * The half of a module's life that is not "install".
 *
 * Every one of these was a gap: a removed folder left its row forever, an
 * uninstall left its permissions granted, and a version bump did nothing at
 * all. None of them break a page, which is why they went unnoticed — and why
 * they need tests rather than eyes.
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

/** Swap the registry for the duration of one test, then put it back. */
async function withRegistry<T>(manifests: ModuleManifest[], run: () => Promise<T>): Promise<T> {
  const original = [...MODULES]
  MODULES.length = 0
  MODULES.push(...manifests)

  try {
    return await run()
  } finally {
    MODULES.length = 0
    MODULES.push(...original)
  }
}

test.group('Module lifecycle | permission revocation', (group) => {
  group.each.setup(async () => {
    await testUtils.db().truncate()
    await testUtils.db().seed()
  })

  test('revokes only the permissions no other module claims', async ({ assert }) => {
    const leaving = manifest({
      name: 'leaving',
      permissions: [
        { name: 'leaving:own', description: 'only this module' },
        { name: 'shared:code', description: 'also declared elsewhere' },
      ],
    })
    const staying = manifest({
      name: 'staying',
      permissions: [{ name: 'shared:code', description: 'also declared elsewhere' }],
    })

    await withRegistry([leaving, staying], async () => {
      const modules = new ModulesService()
      await modules.mintPermissions()

      assert.isNotNull(await Permission.findBy('name', 'leaving:own'))
      assert.isNotNull(await Permission.findBy('name', 'shared:code'))

      const revoked = await modules.revokePermissions('leaving')

      assert.deepEqual(revoked, ['leaving:own'])
      assert.isNull(await Permission.findBy('name', 'leaving:own'))

      /**
       * The one that matters: revoking a permission another installed module
       * still declares would strip a capability from something that is running.
       */
      assert.isNotNull(await Permission.findBy('name', 'shared:code'))
    })
  })

  test('revoking an unknown module is a no-op, not an error', async ({ assert }) => {
    assert.deepEqual(await new ModulesService().revokePermissions('never-existed'), [])
  })
})

test.group('Module lifecycle | orphan pruning', (group) => {
  group.each.setup(async () => {
    await testUtils.db().truncate()
    await testUtils.db().seed()
  })

  test('a row whose folder is gone is pruned', async ({ assert }) => {
    await Module.updateOrCreate(
      { name: 'vanished' },
      {
        id: 'test-vanished',
        name: 'vanished',
        enabled: true,
        version: '1.0.0',
        kind: 'app',
        source: 'bundled',
      }
    )

    await new ModulesService().reconcile()

    assert.isNull(await Module.findBy('name', 'vanished'))
  })

  test('a row whose folder is still there survives', async ({ assert }) => {
    /**
     * `announcements` is a real folder that discovery loaded, so its row must
     * come through reconcile untouched. This is the guard against a pruning
     * rule that is too eager.
     */
    await new ModulesService().reconcile()

    assert.isNotNull(await Module.findBy('name', 'announcements'))
  })
})

test.group('Module lifecycle | first-time enablement', (group) => {
  group.each.setup(async () => {
    await testUtils.db().truncate()
    await testUtils.db().seed()
  })

  test('a newly-detected module with missing tables is created disabled', async ({ assert }) => {
    await Module.query().where('name', 'needs-tables').delete()

    await withRegistry(
      [manifest({ name: 'needs-tables', tables: ['a_table_that_does_not_exist'] })],
      async () => {
        await new ModulesService().reconcile()
      }
    )

    /**
     * Enabling unconditionally is how dropping a folder into `modules/` used to
     * produce a *spurious quarantine*: reconcile switched it on, `boot()` then
     * ran against relations that do not exist and threw, and the provider
     * disabled it again with a `boot_error`. The operator was shown "this
     * module crashed" when the truth was "this module was never installed".
     */
    const row = await Module.findByOrFail('name', 'needs-tables')
    assert.isFalse(Boolean(row.enabled))
  })

  test('a newly-detected module declaring no tables is enabled', async ({ assert }) => {
    await Module.query().where('name', 'no-tables').delete()

    await withRegistry([manifest({ name: 'no-tables' })], async () => {
      await new ModulesService().reconcile()
    })

    // The guard must not make every table-less plugin arrive switched off.
    const row = await Module.findByOrFail('name', 'no-tables')
    assert.isTrue(Boolean(row.enabled))
  })
})

test.group('Module lifecycle | upgrade hook', (group) => {
  group.each.setup(async () => {
    await testUtils.db().truncate()
    await testUtils.db().seed()
  })

  test('onUpgrade runs when the version moves forward', async ({ assert }) => {
    const seen: string[] = []

    await Module.updateOrCreate(
      { name: 'upgradable' },
      {
        id: 'test-upgradable',
        name: 'upgradable',
        enabled: true,
        version: '1.0.0',
        kind: 'app',
        source: 'bundled',
      }
    )

    await withRegistry(
      [
        manifest({
          name: 'upgradable',
          version: '1.1.0',
          onUpgrade: async (from) => void seen.push(from),
        }),
      ],
      async () => {
        await new ModulesService().reconcile()
      }
    )

    assert.deepEqual(seen, ['1.0.0'])
    assert.equal((await Module.findByOrFail('name', 'upgradable')).version, '1.1.0')
  })

  test('onUpgrade does not run on a downgrade', async ({ assert }) => {
    let called = false

    await Module.updateOrCreate(
      { name: 'downgraded' },
      {
        id: 'test-downgraded',
        name: 'downgraded',
        enabled: true,
        version: '2.0.0',
        kind: 'app',
        source: 'bundled',
      }
    )

    await withRegistry(
      [
        manifest({
          name: 'downgraded',
          version: '1.0.0',
          onUpgrade: async () => void (called = true),
        }),
      ],
      async () => {
        await new ModulesService().reconcile()
      }
    )

    // There is no upgrade path to run backwards, and running one would be worse
    // than doing nothing.
    assert.isFalse(called)
  })

  test('a failing onUpgrade is logged but leaves the module enabled', async ({ assert }) => {
    await Module.updateOrCreate(
      { name: 'flaky' },
      {
        id: 'test-flaky',
        name: 'flaky',
        enabled: true,
        version: '1.0.0',
        kind: 'app',
        source: 'bundled',
      }
    )

    await withRegistry(
      [
        manifest({
          name: 'flaky',
          version: '1.1.0',
          onUpgrade: async () => {
            throw new Error('backfill failed')
          },
        }),
      ],
      async () => {
        await new ModulesService().reconcile()
      }
    )

    /**
     * Disabling a package that works because a data backfill failed is worse
     * than a backfill that is visibly incomplete.
     */
    const row = await Module.findByOrFail('name', 'flaky')
    assert.isTrue(Boolean(row.enabled))
    assert.equal(row.version, '1.1.0')
  })
})

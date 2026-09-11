import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import app from '@adonisjs/core/services/app'

/**
 * The guard that stops two builds interleaving.
 *
 * Tested through real processes rather than by calling the function twice: the
 * property being asserted is that a *separate process* is refused, and an
 * in-process call would prove nothing about `mkdir`'s atomicity.
 */

const run = promisify(execFile)
const LOCK_DIR = app.makePath('tmp/build.lock')
const SCRIPT = app.makePath('scripts/build-lock.mjs')

/** Take the lock in a child, report the outcome, and hold until told to stop. */
function acquireInChild(holdMs: number) {
  return run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { acquireBuildLock } from ${JSON.stringify(SCRIPT)}
      try {
        acquireBuildLock()
        console.log('ACQUIRED')
        await new Promise((r) => setTimeout(r, ${holdMs}))
      } catch (error) {
        console.log('REFUSED:' + error.name)
      }`,
    ],
    { cwd: app.appRoot.pathname }
  )
}

test.group('Build lock', (group) => {
  group.each.setup(() => {
    rmSync(LOCK_DIR, { recursive: true, force: true })
    return () => rmSync(LOCK_DIR, { recursive: true, force: true })
  })

  test('a second process is refused while the first holds it', async ({ assert }) => {
    const first = acquireInChild(3_000)

    /** Give the first process time to actually take it. */
    await new Promise((r) => setTimeout(r, 700))

    const second = await acquireInChild(0)

    assert.include(second.stdout, 'REFUSED:BuildLockedError')
    assert.include((await first).stdout, 'ACQUIRED')
  }).timeout(20_000)

  test('the lock is released when the holder exits', async ({ assert }) => {
    await acquireInChild(0)

    assert.isFalse(existsSync(LOCK_DIR), 'lock directory should be gone')

    const next = await acquireInChild(0)
    assert.include(next.stdout, 'ACQUIRED')
  }).timeout(20_000)

  test('a lock left behind by a dead process is taken over', async ({ assert }) => {
    /**
     * The case that matters most on a small VPS: a build killed by the OOM
     * killer leaves the directory behind. Respecting that lock forever would
     * mean no further install is possible until someone SSHes in.
     *
     * PID 1 would be alive, so a pid that cannot exist is used instead.
     */
    mkdirSync(LOCK_DIR, { recursive: true })
    writeFileSync(join(LOCK_DIR, 'pid'), '2147483647')

    const result = await acquireInChild(0)
    assert.include(result.stdout, 'ACQUIRED')
  }).timeout(20_000)

  test('a lock with no pid file is treated as stale', async ({ assert }) => {
    mkdirSync(LOCK_DIR, { recursive: true })

    const result = await acquireInChild(0)
    assert.include(result.stdout, 'ACQUIRED')
  }).timeout(20_000)
})

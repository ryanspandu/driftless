import { test } from '@japa/runner'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalDriver } from '#services/storage/local_driver'

/**
 * The `local` driver — a thin `fs` wrapper, not wired into production call
 * sites (see its own docstring), but exercised here as the same-interface
 * counterpart the `s3` driver's tests compare against.
 */
test.group('storage | local driver', (group) => {
  let root: string

  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'driftless-storage-test-'))
    return () => rm(root, { recursive: true, force: true })
  })

  test('put then read round-trips the bytes', async ({ assert }) => {
    const driver = createLocalDriver(root)
    const src = join(root, 'source.txt')
    await writeFile(src, 'hello world')

    await driver.putFile('greeting.txt', src)

    assert.isTrue(await driver.exists('greeting.txt'))
    assert.equal((await driver.readToBuffer('greeting.txt')).toString(), 'hello world')
  })

  test('readToFile writes the bytes to the given path', async ({ assert }) => {
    const driver = createLocalDriver(root)
    const src = join(root, 'source.txt')
    await writeFile(src, 'copy me')
    await driver.putFile('a.txt', src)

    const dest = join(root, 'nested', 'b.txt')
    await driver.readToFile('a.txt', dest)

    assert.equal((await readFile(dest)).toString(), 'copy me')
  })

  test('delete removes the key; exists reflects it', async ({ assert }) => {
    const driver = createLocalDriver(root)
    const src = join(root, 'source.txt')
    await writeFile(src, 'gone soon')
    await driver.putFile('c.txt', src)
    assert.isTrue(await driver.exists('c.txt'))

    await driver.delete('c.txt')
    assert.isFalse(await driver.exists('c.txt'))
  })

  test('delete on a missing key does not throw', async ({ assert }) => {
    const driver = createLocalDriver(root)
    await assert.doesNotReject(() => driver.delete('never-existed.txt'))
  })

  test('a key that escapes the root is rejected', async ({ assert }) => {
    const driver = createLocalDriver(root)
    await assert.rejects(() => driver.readToBuffer('../../etc/passwd'))
  })
})

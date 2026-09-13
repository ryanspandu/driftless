import { test } from '@japa/runner'
// Puts `assert` on the test context (same reason as api-discriminator.spec.ts).
import '@japa/assert'
// Relative imports with `.js` (repo convention; the `~/` alias is Vite-only and
// hangs the Node runner, and extensionless relative imports break ts-exec).
import { MemoryLocalStore } from './memory-store.js'
import { cmsEntity } from './schema.js'

/**
 * Guards `putServerRows` against the data-loss-in-reverse bug: a record
 * deleted on the server stayed cached locally forever — still showing as
 * "Published" with a green synced checkmark in the admin — because the pull
 * sync only ever upserted rows the server returned and never noticed a
 * previously-synced row had dropped out of that list.
 */

interface Rec {
  id: string
  status: string
  authorId: string | null
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

const rec = (id: string, data: Record<string, unknown>, updatedAt: string): Rec => ({
  id,
  status: 'PUBLISHED',
  authorId: null,
  data,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt,
})

test.group('offline | putServerRows reconciles server-side deletions', () => {
  test('a clean synced row the server no longer returns is removed locally', async ({
    assert,
  }) => {
    const store = new MemoryLocalStore('test')
    await store.ready()
    const entity = cmsEntity('how_it_works')

    await store.putServerRows(entity, [
      { id: 'r1', data: rec('r1', { title: 'One' }, 'X'), serverUpdatedAt: 'X' },
      { id: 'r2', data: rec('r2', { title: 'Two' }, 'X'), serverUpdatedAt: 'X' },
    ])
    assert.lengthOf(await store.getAll(entity), 2)

    // Server no longer has r2 (deleted there since the last sync).
    await store.putServerRows(entity, [
      { id: 'r1', data: rec('r1', { title: 'One' }, 'X'), serverUpdatedAt: 'X' },
    ])

    const rows = await store.getAll(entity)
    assert.deepEqual(
      rows.map((r) => r.id),
      ['r1']
    )
  })

  test('a row with a pending local edit is left alone, not silently discarded', async ({
    assert,
  }) => {
    const store = new MemoryLocalStore('test')
    await store.ready()
    const entity = cmsEntity('how_it_works')

    await store.putServerRows(entity, [
      { id: 'r1', data: rec('r1', { title: 'One' }, 'X'), serverUpdatedAt: 'X' },
    ])
    // Locally edit it (queues a pending update) before the next pull happens.
    await store.upsertLocal(entity, { id: 'r1', data: rec('r1', { title: 'One (edited)' }, 'l1') }, 'update')

    // The server no longer has it at all now (deleted by someone else).
    await store.putServerRows(entity, [])

    const row = await store.getById<Rec>(entity, 'r1')
    // Not deleted — the outbox push for this pending job is what should
    // discover the "gone" condition and flag it as a real conflict
    // (SyncEngine.markGoneConflict), so the unsent edit isn't silently lost.
    assert.isNotNull(row)
    assert.equal(row!.data.data.title, 'One (edited)')
    assert.isNotNull(row!._sync.pendingSince)
  })

  test('a row still pending its initial create (never reached the server) is left alone', async ({
    assert,
  }) => {
    const store = new MemoryLocalStore('test')
    await store.ready()
    const entity = cmsEntity('how_it_works')

    // Created locally; its outbox create job hasn't synced yet, so it has no
    // server counterpart — it should never appear in a server response.
    await store.upsertLocal(entity, { id: 'new1', data: rec('new1', { title: 'Brand new' }, 'l1') }, 'create')

    await store.putServerRows(entity, [
      { id: 'other', data: rec('other', { title: 'Other' }, 'X'), serverUpdatedAt: 'X' },
    ])

    const row = await store.getById<Rec>(entity, 'new1')
    assert.isNotNull(row)
    assert.isNotNull(row!._sync.pendingSince)
  })

  test('rows still present on the server are untouched (no unnecessary churn)', async ({
    assert,
  }) => {
    const store = new MemoryLocalStore('test')
    await store.ready()
    const entity = cmsEntity('how_it_works')

    await store.putServerRows(entity, [
      { id: 'r1', data: rec('r1', { title: 'One' }, 'X'), serverUpdatedAt: 'X' },
    ])
    const before = await store.getById<Rec>(entity, 'r1')

    await store.putServerRows(entity, [
      { id: 'r1', data: rec('r1', { title: 'One' }, 'Y'), serverUpdatedAt: 'Y' },
    ])
    const after = await store.getById<Rec>(entity, 'r1')

    assert.isNotNull(after)
    assert.equal(after!._sync.baseUpdatedAt, 'Y')
    assert.notEqual(before!._sync.baseUpdatedAt, after!._sync.baseUpdatedAt)
  })
})

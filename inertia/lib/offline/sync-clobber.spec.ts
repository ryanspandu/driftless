import { test } from '@japa/runner'
// Puts `assert` on the test context (same reason as api-discriminator.spec.ts).
import '@japa/assert'
// Relative imports with `.js` (repo convention; the `~/` alias is Vite-only and
// hangs the Node runner, and extensionless relative imports break ts-exec).
import { MemoryLocalStore } from './memory-store.js'
import { cmsEntity } from './schema.js'

/**
 * Guards the offline sync engine against the data-loss bug where a late job ack
 * (`markSynced`) clobbered a newer local edit made while the first job was in
 * flight — the "edit one field, then another doesn't save" report.
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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

test.group('offline | markSynced never clobbers a newer local edit', () => {
  test('a late ack of the first edit keeps the second edit', async ({ assert }) => {
    const store = new MemoryLocalStore('test')
    await store.ready()
    const entity = cmsEntity('reviews')

    // Existing server row.
    await store.putServerRows(entity, [
      { id: 'r1', data: rec('r1', { name: 'base' }, 'X'), serverUpdatedAt: 'X' },
    ])

    // Edit 1 (field A), enqueued as job1.
    await store.upsertLocal(entity, { id: 'r1', data: rec('r1', { name: 'A' }, 'l1') }, 'update')
    const job1CreatedAt = (await store.getById<Rec>(entity, 'r1'))!._sync.pendingSince!

    // A later tick so edit 2's pendingSince is strictly newer than job1.
    await delay(5)

    // Edit 2 (field A + B) BEFORE job1 has acked, enqueued as job2.
    await store.upsertLocal(
      entity,
      { id: 'r1', data: rec('r1', { name: 'A', extra: 'B' }, 'l2') },
      'update'
    )
    const job2CreatedAt = (await store.getById<Rec>(entity, 'r1'))!._sync.pendingSince!
    assert.isTrue(job2CreatedAt > job1CreatedAt)

    // job1 acks LATE with the stale server result (field A only).
    await store.markSynced(entity, 'r1', rec('r1', { name: 'A' }, 'Y'), 'Y', job1CreatedAt)

    const afterJob1 = (await store.getById<Rec>(entity, 'r1'))!
    // The newer edit (B) must survive; the row stays pending; base advances.
    assert.deepEqual(afterJob1.data.data, { name: 'A', extra: 'B' })
    assert.isNotNull(afterJob1._sync.pendingSince)
    assert.equal(afterJob1._sync.baseUpdatedAt, 'Y')
    assert.isFalse(afterJob1._sync.synced)

    // job2 acks with the full result (A + B) → row becomes synced.
    await store.markSynced(
      entity,
      'r1',
      rec('r1', { name: 'A', extra: 'B' }, 'Z'),
      'Z',
      job2CreatedAt
    )

    const afterJob2 = (await store.getById<Rec>(entity, 'r1'))!
    assert.deepEqual(afterJob2.data.data, { name: 'A', extra: 'B' })
    assert.isTrue(afterJob2._sync.synced)
    assert.isNull(afterJob2._sync.pendingSince)
    assert.equal(afterJob2._sync.baseUpdatedAt, 'Z')
  })

  test('a normal single edit still acks fully (no regression)', async ({ assert }) => {
    const store = new MemoryLocalStore('test')
    await store.ready()
    const entity = cmsEntity('reviews')

    await store.upsertLocal(entity, { id: 'r2', data: rec('r2', { name: 'A' }, 'l1') }, 'update')
    const jobCreatedAt = (await store.getById<Rec>(entity, 'r2'))!._sync.pendingSince!

    await store.markSynced(entity, 'r2', rec('r2', { name: 'A' }, 'Y'), 'Y', jobCreatedAt)

    const row = (await store.getById<Rec>(entity, 'r2'))!
    assert.isTrue(row._sync.synced)
    assert.isNull(row._sync.pendingSince)
    assert.equal(row._sync.baseUpdatedAt, 'Y')
  })
})

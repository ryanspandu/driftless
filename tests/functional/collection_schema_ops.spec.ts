import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import CmsService from '#services/cms_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

test.group('Collection schema ops', (group) => {
  group.each.setup(async () => resetDatabase())

  test('addField with unique enforces uniqueness in the DB (M6)', async ({ assert }) => {
    // `truncate()` clears metadata rows but not the runtime-created dynamic
    // table, which can linger from a prior run — drop it so this is idempotent.
    await db.rawQuery('DROP TABLE IF EXISTS "cms_products"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'products',
      label: 'Products',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    await cms.addField('products', { key: 'sku', label: 'SKU', type: 'TEXT', unique: true })

    await cms.createRecord('products', 1, { data: { title: 'A', sku: 'X1' }, status: 'PUBLISHED' })
    await assert.rejects(() =>
      cms.createRecord('products', 1, { data: { title: 'B', sku: 'X1' }, status: 'PUBLISHED' })
    )
    // Distinct values are fine.
    await cms.createRecord('products', 1, { data: { title: 'C', sku: 'X2' }, status: 'PUBLISHED' })
  })

  test('a component key can be reused after the component is deleted (M4)', async ({ assert }) => {
    const cms = new CmsService()
    await cms.createComponent({
      key: 'seo',
      label: 'SEO',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    await cms.deleteComponent('seo')

    // Re-creating with the same key must succeed (revives the trashed row),
    // not hit the DB unique constraint on `key`.
    const revived = await cms.createComponent({
      key: 'seo',
      label: 'SEO v2',
      fields: [{ key: 'description', label: 'Description', type: 'TEXTAREA' }],
    })
    assert.equal(revived.label, 'SEO v2')
    assert.equal(revived.fields.length, 1)
    assert.equal(revived.fields[0]!.key, 'description')
  })

  test('a component rejects a non-scalar sub-field type (L5)', async ({ assert }) => {
    const cms = new CmsService()
    await assert.rejects(() =>
      cms.createComponent({
        key: 'bad',
        label: 'Bad',
        // SELECT is not in the scalar whitelist even though the type exists.
        fields: [{ key: 'choice', label: 'Choice', type: 'SELECT' as any }],
      })
    )
  })

  test('createCollection with an invalid field key leaves NO zombie (atomic)', async ({
    assert,
  }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_zombietest"')
    const cms = new CmsService()
    // camelCase key is rejected; the whole create must roll back / never write.
    await assert.rejects(() =>
      cms.createCollection({
        key: 'zombietest',
        label: 'Zombie',
        fields: [
          { key: 'title', label: 'Title', type: 'TEXT' },
          { key: 'compareAtPrice', label: 'Bad', type: 'NUMBER' },
        ],
      })
    )
    // No metadata row and no physical table left behind.
    const list = await cms.listCollections()
    assert.isUndefined(list.find((c) => c.key === 'zombietest'))
    assert.isFalse(await db.connection().schema.hasTable('cms_zombietest'))
  })

  test('createCollection creates the physical table atomically', async ({ assert }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_atomicok"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'atomicok',
      label: 'OK',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    assert.isTrue(await db.connection().schema.hasTable('cms_atomicok'))
  })

  test('delete → restore round-trips a collection (soft delete keeps the table)', async ({
    assert,
  }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_restoreme"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'restoreme',
      label: 'Restore Me',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    await cms.deleteCollection('restoreme')
    assert.isUndefined((await cms.listCollections()).find((c) => c.key === 'restoreme'))
    // Table is kept while trashed.
    assert.isTrue(await db.connection().schema.hasTable('cms_restoreme'))

    const restored = await cms.restoreCollection('restoreme')
    assert.equal(restored.key, 'restoreme')
    assert.isDefined((await cms.listCollections()).find((c) => c.key === 'restoreme'))
  })

  test('force delete drops the physical table (atomic)', async ({ assert }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_forceme"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'forceme',
      label: 'Force Me',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    await cms.deleteCollection('forceme')
    await cms.forceDeleteCollection('forceme')
    assert.isFalse(await db.connection().schema.hasTable('cms_forceme'))
    // And the key is free to reuse afterwards.
    await cms.createCollection({
      key: 'forceme',
      label: 'Force Me 2',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    assert.isTrue(await db.connection().schema.hasTable('cms_forceme'))
  })

  test('recreating a collection whose key is in Trash gives a clear error', async ({ assert }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_trashclash"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'trashclash',
      label: 'Trash Clash',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    await cms.deleteCollection('trashclash')
    await assert.rejects(
      () =>
        cms.createCollection({
          key: 'trashclash',
          label: 'Again',
          fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
        }),
      /Trash/
    )
  })

  test('listRecords tolerates a missing physical table (no 500)', async ({ assert }) => {
    await db.rawQuery('DROP TABLE IF EXISTS "cms_ghosttbl"')
    const cms = new CmsService()
    await cms.createCollection({
      key: 'ghosttbl',
      label: 'Ghost',
      fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
    })
    // Simulate the zombie: drop the table out from under the metadata.
    await db.rawQuery('DROP TABLE IF EXISTS "cms_ghosttbl"')
    const res = await cms.listRecords('ghosttbl', {})
    assert.equal(res.total, 0)
    assert.lengthOf(res.items, 0)
    // And the trashed list is tolerant too.
    assert.lengthOf(await cms.listTrashedRecords('ghosttbl'), 0)
  })
})

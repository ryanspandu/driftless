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
})

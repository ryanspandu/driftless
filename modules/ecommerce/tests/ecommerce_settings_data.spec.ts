import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Role from '#models/role'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import CatalogService from '#modules/ecommerce/services/catalog_service'
import Product from '#modules/ecommerce/models/product'
import SiteExportService from '#services/data_transfer/site_export_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'
import { registerEcommerceDataSection } from '#modules/ecommerce/services/data_transfer'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  await new ModulesService().mintPermissions()
  new ModulesService().bustCache()
  registerCoreDataSections()
  registerEcommerceDataSection()
  return cleanup
}

/** SUPERADMIN holds `*` — covers `ecommerce:settings:manage`. */
async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

/** ADMIN role — holds no `ecommerce:*` codes. */
async function plainAdmin() {
  const role = await Role.query().where('name', 'ADMIN').firstOrFail()
  const user = await User.create({
    email: `plain-${Date.now()}@example.com`,
    password: 'password123',
    username: `plain${Date.now()}`,
    status: 'ACTIVE',
  })
  await user.related('roles').attach([role.id])
  return user
}

test.group('E-commerce | settings data export/import', (group) => {
  group.each.setup(async () => resetDatabase())

  test('export is gated on ecommerce:settings:manage', async ({ client }) => {
    const res = await client
      .post('/api/admin/ecommerce/data/export')
      .loginAs(await plainAdmin())
      .json({})
    res.assertStatus(403)
  })

  test('export returns a .driftless attachment for an authorized admin', async ({
    client,
    assert,
  }) => {
    await new CatalogService().create({ title: 'Sofa', slug: 'sofa', status: 'active' }, null)
    const res = await client
      .post('/api/admin/ecommerce/data/export')
      .loginAs(await adminUser())
      .json({ sections: ['ecommerce'] })
    res.assertStatus(200)
    assert.include(String(res.headers()['content-disposition']), 'ecommerce-')
    assert.include(String(res.headers()['content-disposition']), '.driftless')
  })

  test('import through the store endpoint round-trips and clamps to ecommerce sections', async ({
    client,
    assert,
  }) => {
    const catalog = new CatalogService()
    const product = await catalog.create({ title: 'Sofa', slug: 'sofa', status: 'active' }, null)

    // A WHOLE-SITE archive (core sections + ecommerce). Importing it through the
    // store endpoint must touch only the ecommerce sections.
    const archive = await new SiteExportService().export()

    await Product.query().delete()
    assert.isNull(await Product.query().where('id', product.id).first())

    const res = await client
      .post('/api/admin/ecommerce/data/import')
      .loginAs(await adminUser())
      .file('archive', archive, {
        filename: 'site.driftless',
        contentType: 'application/octet-stream',
      })
    res.assertStatus(200)

    const body = res.body() as { sections: Array<{ name: string }> }
    // Only ecommerce sections were processed — core sections were clamped out.
    for (const s of body.sections) {
      assert.include(['ecommerce', 'ecommerce_orders'], s.name)
    }
    // The catalog was restored.
    assert.isNotNull(await Product.query().where('id', product.id).first())
  })
})

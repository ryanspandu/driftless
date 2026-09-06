import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import ModulesService from '#services/modules_service'
import CatalogService from '#modules/ecommerce/services/catalog_service'
import Product from '#modules/ecommerce/models/product'
import Category from '#modules/ecommerce/models/category'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'
import { registerEcommerceDataSection } from '#modules/ecommerce/services/data_transfer'

/**
 * The ecommerce module contributes its own export/import section from `boot()`.
 * These verify the catalog + category pivot round-trips with ids preserved, and
 * that a DISABLED store's section is reported skipped (never run) on import —
 * the core-can't-import-a-module design proven end to end.
 */
test.group('Ecommerce | data transfer', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    await new ModulesService().setEnabled('ecommerce', true)
    registerCoreDataSections()
    registerEcommerceDataSection()
    return cleanup
  })

  test('catalog + category pivot round-trip (preserve ids)', async ({ assert }) => {
    const catalog = new CatalogService()
    const cat = await catalog.createCategory({ name: 'Furniture', slug: 'furniture' })
    const prod = await catalog.create({ title: 'Sofa', slug: 'sofa', status: 'active' }, null)
    await db.table('ecommerce_product_categories').insert({
      product_id: prod.id,
      category_id: cat.id,
    })

    const archive = await new SiteExportService().export({ only: ['ecommerce'] })

    await db.from('ecommerce_product_categories').delete()
    await db.from('ecommerce_products').delete()
    await db.from('ecommerce_categories').delete()

    const result = await new SiteImportService().import(archive)
    assert.isTrue(result.sections.some((s) => s.name === 'ecommerce'))
    assert.isNotNull(await Product.query().where('id', prod.id).first())
    assert.isNotNull(await Category.query().where('id', cat.id).first())
    const pivot = await db.from('ecommerce_product_categories').where('product_id', prod.id).first()
    assert.isNotNull(pivot)
  })

  test('a disabled store is reported skipped, not run', async ({ assert }) => {
    const catalog = new CatalogService()
    await catalog.create({ title: 'X', slug: 'x', status: 'active' }, null)
    const archive = await new SiteExportService().export({ only: ['ecommerce'] })

    await new ModulesService().setEnabled('ecommerce', false)
    await db.from('ecommerce_products').delete()

    const result = await new SiteImportService().import(archive)
    assert.isTrue(result.skipped.some((s) => s.name === 'ecommerce'))
    assert.lengthOf(await Product.query(), 0)
  })
})

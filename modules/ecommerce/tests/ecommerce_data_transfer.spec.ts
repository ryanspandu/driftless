import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { newUlid } from '#services/ulid_service'
import ModulesService from '#services/modules_service'
import CatalogService from '#modules/ecommerce/services/catalog_service'
import Product from '#modules/ecommerce/models/product'
import Category from '#modules/ecommerce/models/category'
import Account from '#modules/ecommerce/models/account'
import Order from '#modules/ecommerce/models/order'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'
import {
  registerEcommerceDataSection,
  ecommerceOrdersSection,
} from '#modules/ecommerce/services/data_transfer'

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

  test('orders & customers round-trip and strip secrets', async ({ assert }) => {
    const account = await Account.create({
      id: newUlid(),
      email: 'buyer@example.com',
      passwordHash: null,
      firstName: 'Bea',
      lastName: 'Buyer',
      status: 'active',
      acceptsMarketing: false,
      ordersCount: 0,
      totalSpentAmount: 0,
    })
    const orderId = newUlid()
    await db.table('ecommerce_orders').insert({
      id: orderId,
      account_id: account.id,
      number: `T-${orderId.slice(-6)}`,
      email: 'buyer@example.com',
      currency: 'USD',
      // Secret columns that must never leave the store on export.
      access_token_hash: 'super-secret-hash',
      access_token_enc: 'super-secret-enc',
      created_at: DateTime.now().toSQL(),
      updated_at: DateTime.now().toSQL(),
    })

    // Secrets are stripped at dump time: the order row carries no token columns.
    const dump = (await ecommerceOrdersSection.export(null as never)) as Record<
      string,
      Array<Record<string, unknown>>
    >
    const dumpedOrder = dump.orders.find((o) => o.id === orderId)
    assert.isDefined(dumpedOrder)
    assert.notProperty(dumpedOrder!, 'accessTokenHash')
    assert.notProperty(dumpedOrder!, 'accessTokenEnc')

    const archive = await new SiteExportService().export({ only: ['ecommerce_orders'] })

    await db.from('ecommerce_orders').delete()
    await db.from('ecommerce_accounts').delete()

    const result = await new SiteImportService().import(archive)
    assert.isTrue(result.sections.some((s) => s.name === 'ecommerce_orders'))
    assert.isNotNull(await Account.query().where('id', account.id).first())
    assert.isNotNull(await Order.query().where('id', orderId).first())
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

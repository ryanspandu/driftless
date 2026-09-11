import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import Module from '#models/module'
import ModulesService from '#services/modules_service'

/**
 * MCP builder-API — commerce (products / variants / categories).
 *
 * These routes live in the MCP module but drive the OPTIONAL ecommerce module
 * via a guarded dynamic import, so every test enables both modules; one test
 * asserts that with ecommerce OFF the routes 404 (the moduleEnabled guard).
 */
async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

async function setEnabled(name: string, enabled: boolean) {
  await new ModulesService().setEnabled(name, enabled)
}

/** Enable both modules the commerce builder-API needs. */
async function enableCommerce() {
  await setEnabled('mcp', true)
  // ecommerce is autoEnable:false; write the row directly + bust the cache the
  // `moduleEnabled` middleware reads (mirrors the ecommerce module's own tests).
  await Module.updateOrCreate(
    { name: 'ecommerce' },
    { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
  )
  new ModulesService().bustCache()
}

async function token(abilities: string[]): Promise<string> {
  const user = await admin()
  const t = await User.accessTokens.create(user, abilities, { name: 'test' })
  return t.value!.release()
}

const bearer = (t: string) => `Bearer ${t}`

test.group('MCP commerce | module + ability gating', (group) => {
  group.each.setup(async () => resetDatabase())

  test('product routes 404 when the ecommerce module is off', async ({ client }) => {
    await setEnabled('mcp', true)
    await setEnabled('ecommerce', false)
    const t = await token(['builder:read', 'builder:products'])
    const res = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'X', price: 1000 })
    res.assertStatus(404)
  })

  test('a read-only token cannot create a product (needs builder:products)', async ({ client }) => {
    await enableCommerce()
    const t = await token(['builder:read'])
    const res = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'X', price: 1000 })
    res.assertStatus(403)
  })

  test('a read token can list products', async ({ client, assert }) => {
    await enableCommerce()
    const t = await token(['builder:read'])
    const res = await client.get('/api/mcp/v1/products').header('Authorization', bearer(t))
    res.assertStatus(200)
    assert.isArray(res.body().items)
  })
})

test.group('MCP commerce | products', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create_product with inline price auto-creates a sellable default variant', async ({
    client,
    assert,
  }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])

    const res = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'Modular Sofa', status: 'active', featured: true, price: 129900, stock: 5 })

    res.assertStatus(201)
    const product = res.body()
    assert.equal(product.title, 'Modular Sofa')
    assert.equal(product.status, 'active')
    assert.lengthOf(product.variants, 1)
    assert.equal(product.variants[0].title, 'Default')
    assert.equal(product.variants[0].price.amount, 129900)
    assert.isNotNull(product.priceFrom)
  })

  test('an active product shows on the public storefront; a draft does not', async ({
    client,
    assert,
  }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])

    await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'Live Chair', status: 'active', price: 4900 })
    await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'Hidden Table', status: 'draft', price: 9900 })

    const shop = await client.get('/api/shop/products')
    shop.assertStatus(200)
    const titles = (shop.body().items as { title: string }[]).map((p) => p.title)
    assert.include(titles, 'Live Chair')
    assert.notInclude(titles, 'Hidden Table')
  })

  test('create_product rejects an invalid status enum (422)', async ({ client }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])
    const res = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'Bad', status: 'published' })
    res.assertStatus(422)
  })

  test('update_product changes a field', async ({ client, assert }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])
    const created = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'Old', price: 1000 })
    const id = created.body().id

    const res = await client
      .put(`/api/mcp/v1/products/${id}`)
      .header('Authorization', bearer(t))
      .json({ title: 'New', featured: true })
    res.assertStatus(200)
    assert.equal(res.body().title, 'New')
    assert.isTrue(res.body().featured)
  })

  test('price with no stock yields a purchasable (untracked) variant, not out-of-stock', async ({
    client,
    assert,
  }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])
    const res = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'Always Available', status: 'active', price: 4900 })
    res.assertStatus(201)
    const variant = res.body().variants[0]
    // trackInventory:false ⇒ available is null (untracked = always sellable),
    // not 0/out-of-stock.
    assert.isFalse(variant.trackInventory)
    assert.isNull(variant.available)
  })

  test('inline compareAtPrice sets a strike-through on the auto Default variant', async ({
    client,
    assert,
  }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])
    const res = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'On Sale', status: 'active', price: 4900, compareAtPrice: 9900 })
    res.assertStatus(201)
    const variant = res.body().variants[0]
    assert.equal(variant.price.amount, 4900)
    assert.equal(variant.compareAt.amount, 9900)
  })

  test('compareAtPrice not above price is rejected (422)', async ({ client }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])
    const res = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'Bad sale', price: 4900, compareAtPrice: 4900 })
    res.assertStatus(422)
  })

  test('an invalid price is rejected BEFORE the product is created (no orphan)', async ({
    client,
    assert,
  }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])
    const res = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'Orphan?', price: 49.99 }) // not an integer minor-unit amount
    res.assertStatus(422)

    // The product must NOT have been created (validation happens before create).
    const list = await client.get('/api/mcp/v1/products').header('Authorization', bearer(t))
    assert.equal(list.body().total, 0)
  })
})

test.group('MCP commerce | variants + categories', (group) => {
  group.each.setup(async () => resetDatabase())

  test('add / update / delete variants, refusing to delete the last', async ({
    client,
    assert,
  }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])

    const product = (
      await client
        .post('/api/mcp/v1/products')
        .header('Authorization', bearer(t))
        .json({ title: 'Tee', price: 2000 })
    ).body()
    const firstVariantId = product.variants[0].id

    const added = await client
      .post(`/api/mcp/v1/products/${product.id}/variants`)
      .header('Authorization', bearer(t))
      .json({ title: 'Large', priceAmount: 2500, stockOnHand: 3 })
    added.assertStatus(201)
    const secondVariantId = added.body().id

    const updated = await client
      .put(`/api/mcp/v1/variants/${secondVariantId}`)
      .header('Authorization', bearer(t))
      .json({ priceAmount: 2600 })
    updated.assertStatus(200)
    assert.equal(updated.body().price.amount, 2600)

    // Two variants now → deleting one is fine.
    const del = await client
      .delete(`/api/mcp/v1/variants/${secondVariantId}`)
      .header('Authorization', bearer(t))
    del.assertStatus(200)

    // Only the original remains → deleting the last is refused.
    const delLast = await client
      .delete(`/api/mcp/v1/variants/${firstVariantId}`)
      .header('Authorization', bearer(t))
    delLast.assertStatus(422)
  })

  test('category CRUD, and a product can be assigned to it', async ({ client, assert }) => {
    await enableCommerce()
    const t = await token(['builder:read', 'builder:products'])

    const cat = await client
      .post('/api/mcp/v1/categories')
      .header('Authorization', bearer(t))
      .json({ name: 'Seating' })
    cat.assertStatus(201)
    const categoryId = cat.body().id

    const list = await client.get('/api/mcp/v1/categories').header('Authorization', bearer(t))
    list.assertStatus(200)
    assert.isAbove(list.body().length, 0)

    const product = await client
      .post('/api/mcp/v1/products')
      .header('Authorization', bearer(t))
      .json({ title: 'Bench', price: 3000, categoryIds: [categoryId] })
    product.assertStatus(201)
    assert.include(product.body().categoryIds, categoryId)

    const del = await client
      .delete(`/api/mcp/v1/categories/${categoryId}`)
      .header('Authorization', bearer(t))
    del.assertStatus(200)
  })
})

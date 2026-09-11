import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import MenusService from '#services/menus_service'
import { getBlockResolver } from '#services/block_data_resolvers'
import { registerCoreBlockResolvers } from '#services/core_block_resolvers'

/**
 * The Menu Manager: reusable, nested, ordered navigation menus, plus the
 * `MenuBar` block's server-side data resolver.
 */

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const svc = new MenusService()

test.group('Menus service', (group) => {
  group.each.setup(async () => resetDatabase())

  test('create derives a handle from the name and keeps handles unique', async ({ assert }) => {
    const a = await svc.create({ name: 'Primary Navigation' })
    assert.equal(a.handle, 'primary-navigation')

    // A second menu with the same name gets a suffixed, still-unique handle.
    const b = await svc.create({ name: 'Primary Navigation' })
    assert.notEqual(b.handle, a.handle)
    assert.match(b.handle, /^primary-navigation-\d+$/)
  })

  test('create rejects an empty name', async ({ assert }) => {
    await assert.rejects(() => svc.create({ name: '   ' }), 'Name is required')
  })

  test('saveTree persists nesting and sibling order', async ({ assert }) => {
    const menu = await svc.create({ name: 'Main', handle: 'main' })
    await svc.saveTree(menu.id, [
      { label: 'Home', type: 'url', url: '/' },
      {
        label: 'Shop',
        type: 'url',
        url: '/shop',
        openMode: 'mega',
        children: [
          { label: 'Men', type: 'url', url: '/shop/men' },
          { label: 'Women', type: 'url', url: '/shop/women' },
        ],
      },
    ])

    const found = await svc.find(menu.id)
    assert.equal(found.itemCount, 4)
    assert.deepEqual(
      found.items.map((i) => i.label),
      ['Home', 'Shop']
    )
    const shop = found.items[1]
    assert.equal(shop.openMode, 'mega')
    assert.deepEqual(
      shop.children.map((c) => c.label),
      ['Men', 'Women']
    )
  })

  test('saveTree preserves kept item ids and prunes removed ones', async ({ assert }) => {
    const menu = await svc.create({ name: 'Nav', handle: 'nav' })
    const first = await svc.saveTree(menu.id, [
      { label: 'A', type: 'url', url: '/a' },
      { label: 'B', type: 'url', url: '/b', children: [{ label: 'B1', type: 'url', url: '/b1' }] },
    ])
    const aId = first.items[0].id

    // Re-save with only A (by id); B and its child must disappear, A must keep its id.
    const second = await svc.saveTree(menu.id, [
      { id: aId, label: 'A renamed', type: 'url', url: '/a' },
    ])
    assert.equal(second.itemCount, 1)
    assert.equal(second.items[0].id, aId)
    assert.equal(second.items[0].label, 'A renamed')
  })

  test('resolveByHandle returns a resolved tree; unknown handle is null', async ({ assert }) => {
    const menu = await svc.create({ name: 'Primary', handle: 'primary' })
    await svc.saveTree(menu.id, [
      { label: 'Docs', type: 'url', url: 'https://example.com', target: '_blank' },
      { label: 'Empty page target', type: 'page', pageId: 'missing-id' },
    ])

    const resolved = await svc.resolveByHandle('primary')
    assert.isNotNull(resolved)
    assert.equal(resolved!.items[0].href, 'https://example.com')
    assert.equal(resolved!.items[0].target, '_blank')
    // A page reference that no longer resolves falls back to '#', never throws.
    assert.equal(resolved!.items[1].href, '#')

    assert.isNull(await svc.resolveByHandle('does-not-exist'))
  })

  test('remove soft-deletes the menu and hides it from lists/resolution', async ({ assert }) => {
    const menu = await svc.create({ name: 'Temp', handle: 'temp' })
    await svc.remove(menu.id)
    const list = await svc.list()
    assert.isUndefined(list.find((m) => m.id === menu.id))
    assert.isNull(await svc.resolveByHandle('temp'))
  })
})

test.group('MenuBar block resolver', (group) => {
  group.each.setup(async () => resetDatabase())

  test('collect keys by handle and resolve returns the tree under that key', async ({ assert }) => {
    // Registered at boot; ensure present regardless of suite ordering.
    if (!getBlockResolver('MenuBar')) registerCoreBlockResolvers()
    const resolver = getBlockResolver('MenuBar')
    assert.isDefined(resolver)

    assert.isNull(resolver!.collect({}, {}))
    assert.deepEqual(resolver!.collect({ menuHandle: 'primary' }, {}), {
      key: 'menu:primary',
      handle: 'primary',
    })

    const menu = await svc.create({ name: 'Primary', handle: 'primary' })
    await svc.saveTree(menu.id, [{ label: 'Home', type: 'url', url: '/' }])

    const out = (await resolver!.resolve([
      { key: 'menu:primary', handle: 'primary' } as never,
    ])) as Record<string, { items: Array<{ label: string }> } | null>
    assert.equal(out['menu:primary']?.items[0].label, 'Home')
  })
})

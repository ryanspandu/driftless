import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Menu from '#models/menu'
import MenuItem from '#models/menu_item'
import MenusService from '#services/menus_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const svc = new MenusService()

/** A menu with two live items, so soft-delete + restore has items to move. */
async function makeMenu(name = 'Main', handle?: string) {
  const menu = await svc.create({ name, handle })
  await svc.saveTree(menu.id, [
    { label: 'Home', type: 'url', url: '/' },
    { label: 'About', type: 'url', url: '/about' },
  ])
  return menu
}

test.group('Menus trash', (group) => {
  group.each.setup(async () => resetDatabase())
  group.each.timeout(30_000)

  test('remove soft-deletes the menu and its items', async ({ assert }) => {
    const menu = await makeMenu()
    await svc.remove(menu.id)

    assert.isEmpty((await svc.list()).filter((m) => m.id === menu.id))
    assert.isNotEmpty((await svc.findTrashed()).filter((m) => m.id === menu.id))

    const liveItems = await MenuItem.query().where('menu_id', menu.id).whereNull('deleted_at')
    assert.isEmpty(liveItems)
  })

  test('restore revives the menu and its items', async ({ assert }) => {
    const menu = await makeMenu()
    await svc.remove(menu.id)
    const restored = await svc.restore(menu.id)

    assert.lengthOf(restored.items, 2)
    const row = await Menu.find(menu.id)
    assert.isNull(row!.deletedAt)
    const liveItems = await MenuItem.query().where('menu_id', menu.id).whereNull('deleted_at')
    assert.lengthOf(liveItems, 2)
  })

  test('restore keeps the handle when nothing else claimed it', async ({ assert }) => {
    const menu = await makeMenu('Main', 'main')
    await svc.remove(menu.id)
    const restored = await svc.restore(menu.id)
    // No live menu could take the handle (the unique index spans trashed rows),
    // so the restored menu keeps it; the re-unique guard is a no-op safety net.
    assert.equal(restored.handle, 'main')
  })

  test('force-delete permanently removes the menu and its items', async ({ assert }) => {
    const menu = await makeMenu()
    await svc.remove(menu.id)
    await svc.forceDelete(menu.id)

    assert.isNull(await Menu.find(menu.id))
    const anyItems = await MenuItem.query().where('menu_id', menu.id)
    assert.isEmpty(anyItems)
  })

  test('restore and force only touch trashed menus', async ({ assert }) => {
    const menu = await makeMenu()
    await assert.rejects(() => svc.restore(menu.id))
    await assert.rejects(() => svc.forceDelete(menu.id))
  })
})

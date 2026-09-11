import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import TemplatesService from '#services/templates_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const svc = new TemplatesService()

test.group('Templates | batch-5 fixes', (group) => {
  group.each.setup(async () => resetDatabase())

  test('duplicating an EMAIL template carries its rendered HTML (M12)', async ({ assert }) => {
    const email = await svc.create({ name: 'Receipt', type: 'EMAIL' })
    await svc.update(email.id, { renderedHtml: '<html>body</html>' })

    const copy = await svc.duplicate(email.id)
    assert.equal(copy.renderedHtml, '<html>body</html>')
  })

  test('setDefault rejects a COLLECTION template (L10)', async ({ assert }) => {
    const card = await svc.create({ name: 'Card', type: 'COLLECTION', collectionKey: 'posts' })
    await assert.rejects(() => svc.setDefault(card.id))
  })

  test('resolveRefs finds a TemplateRef nested inside a zones map (L14)', async ({ assert }) => {
    const header = await svc.create({ name: 'Header', type: 'HEADER' })
    const docWithZone = {
      content: [],
      root: {},
      zones: {
        'root:column': [{ type: 'TemplateRef', props: { templateId: header.id } }],
      },
    }
    const resolved = await svc.resolveRefs([docWithZone])
    assert.property(resolved, header.id)
  })
})

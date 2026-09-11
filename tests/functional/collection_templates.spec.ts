import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Template from '#models/template'
import User from '#models/user'
import TemplatesService from '#services/templates_service'
import PagesService from '#services/pages_service'

/**
 * COLLECTION templates: the item card a CollectionList repeats per record.
 *
 * What is specific to this type — the collection binding, and the fact that a
 * page references the template from *inside* its design (a `CollectionList`
 * block's `templateId`) rather than through a layout/header/footer column.
 */

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const svc = new TemplatesService()

/** A page design whose only block is a CollectionList in template mode. */
function pageWithList(templateId: string, collectionKey = 'posts') {
  return {
    root: {},
    content: [
      {
        type: 'CollectionList',
        props: {
          id: 'list-1',
          source: { collectionKey },
          template: 'template',
          templateId,
          item: [],
          empty: [],
        },
      },
    ],
  }
}

test.group('Collection templates', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a collection template is bound to a collection', async ({ assert }) => {
    const created = await svc.create({
      name: 'Post card',
      type: 'COLLECTION',
      collectionKey: 'posts',
    })
    assert.equal(created.type, 'COLLECTION')
    assert.equal(created.collectionKey, 'posts')

    const found = await svc.find(created.id)
    assert.equal(found.collectionKey, 'posts')
  })

  test('a collection template without a collection is refused', async ({ assert }) => {
    await assert.rejects(
      () => svc.create({ name: 'Unbound', type: 'COLLECTION' }),
      /bound to a collection/
    )
  })

  test('other types never carry a collection key', async ({ assert }) => {
    // A key sent for a header is meaningless; it must not surface in the
    // CollectionList template picker (which matches on `collectionKey`).
    const header = await svc.create({ name: 'Header', type: 'HEADER', collectionKey: 'posts' })
    assert.isNull(header.collectionKey)
  })

  test('the type filter lists only collection templates', async ({ assert }) => {
    await svc.create({ name: 'Post card', type: 'COLLECTION', collectionKey: 'posts' })
    await svc.create({ name: 'Team card', type: 'COLLECTION', collectionKey: 'team' })
    await svc.create({ name: 'Header', type: 'HEADER' })

    const listed = await svc.list('COLLECTION')
    assert.deepEqual(listed.map((t) => [t.name, t.collectionKey]).sort(), [
      ['Post card', 'posts'],
      ['Team card', 'team'],
    ])
  })

  test('duplicating keeps the collection binding', async ({ assert }) => {
    const source = await svc.create({
      name: 'Post card',
      type: 'COLLECTION',
      collectionKey: 'posts',
    })
    const copy = await svc.duplicate(source.id)
    assert.equal(copy.collectionKey, 'posts')
    assert.equal(copy.name, 'Post card (copy)')
  })

  test('update can rebind the collection, but not clear it', async ({ assert }) => {
    const created = await svc.create({
      name: 'Post card',
      type: 'COLLECTION',
      collectionKey: 'posts',
    })
    const rebound = await svc.update(created.id, { collectionKey: 'articles' })
    assert.equal(rebound.collectionKey, 'articles')
    await assert.rejects(
      () => svc.update(created.id, { collectionKey: '' }),
      /bound to a collection/
    )
  })

  test('a CollectionList templateId is preloaded like a TemplateRef', async ({ assert }) => {
    const card = await svc.create({
      name: 'Post card',
      type: 'COLLECTION',
      collectionKey: 'posts',
      content: { root: {}, content: [{ type: 'Text', props: { id: 't', text: 'CARD' } }] },
    })

    // The server resolves every referenced template for SSR; a CollectionList's
    // template must be in that map or the first paint shows "Loading…".
    const resolved = await svc.resolveRefs([pageWithList(card.id)])
    assert.property(resolved, card.id)
    assert.deepEqual(
      (resolved[card.id] as { content: { props: { text: string } }[] }).content[0].props.text,
      'CARD'
    )
  })

  test('a template a page repeats cannot be deleted', async ({ assert }) => {
    const card = await svc.create({ name: 'Post card', type: 'COLLECTION', collectionKey: 'posts' })
    const pages = new PagesService()
    await pages.create(1, { title: 'Blog', path: 'blog', content: pageWithList(card.id) })

    const usage = await svc.usages(card.id)
    assert.equal(usage.pages, 1)
    await assert.rejects(() => svc.remove(card.id), /in use/)

    // Unreferenced templates still delete.
    const spare = await svc.create({ name: 'Spare', type: 'COLLECTION', collectionKey: 'posts' })
    await svc.remove(spare.id)
    const row = await Template.findOrFail(spare.id)
    assert.isNotNull(row.deletedAt)
  })

  test('a template placed only in a staged draft is protected too', async ({ assert }) => {
    const card = await svc.create({ name: 'Post card', type: 'COLLECTION', collectionKey: 'posts' })
    const pages = new PagesService()
    const page = await pages.create(1, {
      title: 'Blog',
      path: 'blog',
      content: { root: {}, content: [] },
    })
    await pages.saveDraft(page.id, { content: pageWithList(card.id) })

    const usage = await svc.usages(card.id)
    assert.equal(usage.pages, 1)
  })

  test('the public endpoint serves the template once a published page repeats it', async ({
    client,
  }) => {
    const card = await svc.create({ name: 'Post card', type: 'COLLECTION', collectionKey: 'posts' })

    // Unreferenced: not reachable (same rule as any other template).
    const before = await client.get(`/api/public/templates/${card.id}`)
    before.assertStatus(404)

    const pages = new PagesService()
    const page = await pages.create(1, {
      title: 'Blog',
      path: 'blog',
      content: pageWithList(card.id),
    })
    await pages.update(page.id, 1, { status: 'PUBLISHED' })

    // The public shape is deliberately minimal — id + content, nothing about
    // where the template is used.
    const after = await client.get(`/api/public/templates/${card.id}`)
    after.assertStatus(200)
    after.assertBodyContains({ id: card.id })
  })

  test('the admin API round-trips the collection key', async ({ client, assert }) => {
    const admin = await User.query().where('email', 'admin@driftless.local').firstOrFail()

    const created = await client
      .post('/api/admin/templates')
      .loginAs(admin)
      .json({ name: 'Post card', type: 'COLLECTION', collectionKey: 'posts' })
    created.assertStatus(201)
    assert.equal(created.body().collectionKey, 'posts')

    const listed = await client.get('/api/admin/templates?type=COLLECTION').loginAs(admin)
    listed.assertStatus(200)
    assert.lengthOf(listed.body(), 1)
    assert.equal(listed.body()[0].collectionKey, 'posts')

    const refused = await client
      .post('/api/admin/templates')
      .loginAs(admin)
      .json({ name: 'Unbound', type: 'COLLECTION' })
    refused.assertStatus(422)
  })
})

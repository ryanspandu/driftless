import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import CmsService from '#services/cms_service'
import Media from '#models/media'
import { newUlid } from '#services/ulid_service'

/**
 * A MEDIA field stores a media id; public render paths (opt-in via
 * `resolveMedia`) swap it for the media's URL so a CollectionList image binding
 * renders. A value already a URL is left untouched.
 */
test.group('CMS | resolveMedia swaps MEDIA ids for URLs', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    return cleanup
  })

  test('a MEDIA field id resolves to its URL; a URL passes through', async ({ assert }) => {
    const cms = new CmsService()
    await cms.createCollection({
      key: 'gallery',
      label: 'Gallery',
      draftsOn: false,
      fields: [
        { key: 'title', label: 'Title', type: 'TEXT', required: true },
        { key: 'photo', label: 'Photo', type: 'MEDIA' },
      ],
    })

    const media = await Media.create({
      id: newUlid(),
      filename: `${newUlid()}.jpg`,
      mimeType: 'image/jpeg',
      size: 1234,
      url: '/uploads/example.jpg',
    })

    await cms.createRecord('gallery', null, {
      data: { title: 'By id', photo: media.id },
      status: 'PUBLISHED',
    })
    await cms.createRecord('gallery', null, {
      data: { title: 'By url', photo: 'https://cdn.example.com/y.jpg' },
      status: 'PUBLISHED',
    })

    // Admin/raw path keeps the stored value (the id).
    const raw = await cms.listRecords('gallery', { sortField: 'title', sortDir: 'asc' })
    const rawById = raw.items.find((r) => r.data.title === 'By id')!
    assert.equal(rawById.data.photo, media.id)

    // Public render path resolves the id → URL, and leaves the URL untouched.
    const resolved = await cms.listRecords(
      'gallery',
      { sortField: 'title', sortDir: 'asc' },
      { resolveMedia: true }
    )
    const byId = resolved.items.find((r) => r.data.title === 'By id')!
    const byUrl = resolved.items.find((r) => r.data.title === 'By url')!
    assert.equal(byId.data.photo, '/uploads/example.jpg')
    assert.equal(byUrl.data.photo, 'https://cdn.example.com/y.jpg')
  })
})

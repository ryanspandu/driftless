import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { newUlid } from '#services/ulid_service'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'
import MenusService from '#services/menus_service'
import CmsService from '#services/cms_service'
import Form from '#models/form'
import { IntegrationSettingsService, WebSettingsService } from '#services/settings_service'
import MailEventSetting from '#models/mail_event_setting'

/**
 * The config sections added for a faithful web A→B migration: navigation
 * (menus/menu_items), builder forms, integration settings and per-email copy.
 * Each round-trips through a real .driftless archive in preserve mode.
 */
test.group('Data transfer | config sections', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    registerCoreDataSections()
    return cleanup
  })

  test('menus + nested items round-trip by handle', async ({ assert }) => {
    const menus = new MenusService()
    const menu = await menus.create({ name: 'Main', handle: 'main' })
    await menus.saveTree(menu.id, [
      { label: 'Home', type: 'url', url: '/' },
      {
        label: 'About',
        type: 'url',
        url: '/about',
        children: [{ label: 'Team', type: 'url', url: '/about/team' }],
      },
    ])

    const archive = await new SiteExportService().export({ only: ['menus'] })
    await db.from('menu_items').delete()
    await db.from('menus').delete()

    await new SiteImportService().import(archive, { authorId: null })

    const restoredMenu = await db.from('menus').where('handle', 'main').first()
    assert.isNotNull(restoredMenu)
    const items = await db.from('menu_items').whereNull('deleted_at')
    assert.equal(items.length, 3) // Home, About, Team
    const team = items.find((i) => i.label === 'Team')
    const about = items.find((i) => i.label === 'About')
    assert.isDefined(team)
    assert.equal(String(team!.parent_id), String(about!.id)) // nesting preserved
  })

  test('forms round-trip by slug', async ({ assert }) => {
    await Form.create({
      id: newUlid(),
      slug: 'contact',
      title: 'Contact us',
      fields: [{ key: 'email', label: 'Email', type: 'email' }] as never,
      successMessage: 'Thanks!',
      status: 'active',
    })

    const archive = await new SiteExportService().export({ only: ['forms'] })
    await Form.query().delete()

    await new SiteImportService().import(archive, { authorId: null })

    const restored = await Form.findBy('slug', 'contact')
    assert.isNotNull(restored)
    assert.equal(restored!.title, 'Contact us')
    assert.equal(restored!.successMessage, 'Thanks!')
    assert.deepEqual(restored!.fields as unknown, [{ key: 'email', label: 'Email', type: 'email' }])
  })

  test('integration settings (non-secret) round-trip', async ({ assert }) => {
    const svc = new IntegrationSettingsService()
    await svc.update({
      ga4Enabled: true,
      ga4MeasurementId: 'G-TEST123',
      captchaEnabled: true,
      captchaProvider: 'turnstile',
      captchaSiteKey: 'site-key-abc',
    })

    const archive = await new SiteExportService().export({ only: ['integrations'] })
    await svc.update({
      ga4Enabled: false,
      ga4MeasurementId: null,
      captchaEnabled: false,
      captchaSiteKey: null,
    })

    await new SiteImportService().import(archive, { authorId: null })

    const admin = await svc.getAdminSettings()
    // sqlite returns 0/1 for booleans; the app treats them as truthy.
    assert.ok(admin.ga4Enabled)
    assert.equal(admin.ga4MeasurementId, 'G-TEST123')
    assert.ok(admin.captchaEnabled)
    assert.equal(admin.captchaSiteKey, 'site-key-abc')
  })

  test('mail event overrides round-trip by key', async ({ assert }) => {
    await MailEventSetting.updateOrCreate(
      { key: 'order_confirmation' },
      {
        key: 'order_confirmation',
        enabled: true,
        subject: 'Your order is confirmed',
        heading: 'Thank you!',
        intro: null,
        buttonLabel: null,
        outro: null,
        templateId: null,
        codeTemplate: null,
      }
    )

    const archive = await new SiteExportService().export({ only: ['mail_events'] })
    await MailEventSetting.query().delete()

    await new SiteImportService().import(archive, { authorId: null })

    const restored = await MailEventSetting.find('order_confirmation')
    assert.isNotNull(restored)
    assert.equal(restored!.subject, 'Your order is confirmed')
    assert.equal(restored!.heading, 'Thank you!')
    assert.isTrue(restored!.enabled)
  })

  test('"use as page" pointers (home/blog/404) round-trip via settings', async ({ assert }) => {
    const web = new WebSettingsService()
    await web.applyPatches([
      { section: 'content_pages', key: 'posts_archive_page_id', value: 'page-blog-123' },
      { section: 'home_page', key: 'front_page_id', value: 'page-home-456' },
    ])

    const archive = await new SiteExportService().export({ only: ['settings'] })
    // Reset so the import has to restore them.
    await web.applyPatches([
      { section: 'content_pages', key: 'posts_archive_page_id', value: '' },
      { section: 'home_page', key: 'front_page_id', value: '' },
    ])

    await new SiteImportService().import(archive, { authorId: null })

    const sections = await web.getMergedSections()
    assert.equal(sections['content_pages']?.['posts_archive_page_id'], 'page-blog-123')
    assert.equal(sections['home_page']?.['front_page_id'], 'page-home-456')
  })

  test('dynamic collections + records + relations fully round-trip (no post-import setup)', async ({
    assert,
  }) => {
    const cms = new CmsService()
    // Truncate clears cms_collections rows but not the dynamic cms_<key> tables,
    // so drop any leftovers from a previous run to keep this test idempotent.
    for (const t of ['cms_books', 'cms_authors']) {
      await db.connection().schema.dropTableIfExists(t)
    }
    // Target collection with a record, then a source collection that RELATES to it.
    await cms.createCollection({
      key: 'authors',
      label: 'Authors',
      draftsOn: false,
      fields: [{ key: 'name', label: 'Name', type: 'TEXT', required: true }],
    })
    const ada = await cms.createRecord('authors', null, { data: { name: 'Ada' } })
    await cms.createCollection({
      key: 'books',
      label: 'Books',
      draftsOn: false,
      fields: [
        { key: 'title', label: 'Title', type: 'TEXT', required: true },
        {
          key: 'author',
          label: 'Author',
          type: 'RELATION',
          config: { targetKey: 'authors', relationType: 'manyToOne' },
        },
      ],
    })
    await cms.createRecord('books', null, { data: { title: 'Notes', author: ada.id } })

    // Full export → wipe every collection + its physical table → full import.
    const archive = await new SiteExportService().export()
    for (const key of ['books', 'authors']) {
      await cms.deleteCollection(key)
      await cms.forceDeleteCollection(key)
    }
    assert.isFalse(await db.connection().schema.hasTable('cms_books'))

    await new SiteImportService().import(archive, { authorId: null })

    // The physical tables are recreated with no manual setup...
    assert.isTrue(await db.connection().schema.hasTable('cms_authors'))
    assert.isTrue(await db.connection().schema.hasTable('cms_books'))
    // ...records come back with stable ids (preserve mode)...
    const restoredAda = await cms.findRecord('authors', ada.id).catch(() => null)
    assert.isNotNull(restoredAda)
    assert.equal(restoredAda!.data.name, 'Ada')
    // ...and the relation still points at the right record.
    const books = await cms.listRecords('books', { pageSize: 10 }, { resolveRelations: false })
    const notes = books.items.find((b) => b.data.title === 'Notes')
    assert.isDefined(notes)
    assert.equal(String(notes!.data.author), ada.id)
  })
})

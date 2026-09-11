import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import { newUlid } from '#services/ulid_service'
import Content from '#models/content'
import CmsService from '#services/cms_service'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'
import { kitsSection } from '#services/data_transfer/sections/kits'
import TemplateKitsService from '#services/template_kits_service'

test.group('Data transfer | content, content-type collections, kits', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    registerCoreDataSections()
    return cleanup
  })

  test('content posts round-trip with custom data + featured image', async ({ assert }) => {
    await Content.create({
      id: newUlid(),
      title: 'Hello',
      slug: 'hello',
      body: '<p>hi</p>',
      status: 'PUBLISHED',
      data: { subtitle: 'A subtitle' },
      featuredImage: '/uploads/hero.jpg',
      authorId: null,
    })

    const archive = await new SiteExportService().export({ only: ['content'] })
    await Content.query().delete()
    assert.isNull(await Content.query().where('slug', 'hello').first())

    await new SiteImportService().import(archive, { authorId: null })

    const restored = await Content.query().where('slug', 'hello').first()
    assert.isNotNull(restored)
    assert.equal(restored!.featuredImage, '/uploads/hero.jpg')
    assert.deepEqual(restored!.data, { subtitle: 'A subtitle' })
    assert.equal(restored!.status, 'PUBLISHED')
  })

  test('a Content-type collection round-trips as CONTENT (no physical table)', async ({
    assert,
  }) => {
    const cms = new CmsService()
    await cms.createCollection({
      key: 'article_fields',
      label: 'Article Fields',
      type: 'CONTENT',
      fields: [{ key: 'subtitle', label: 'Subtitle', type: 'TEXT' }],
    })

    const archive = await new SiteExportService().export({ only: ['collections'] })

    // Hard-wipe the CMS collection rows so import re-creates from the archive.
    await db.from('cms_fields').delete()
    await db.from('cms_collections').delete()

    await new SiteImportService().import(archive, { authorId: null })

    const restored = await cms.findCollection('article_fields')
    assert.equal(restored.type, 'CONTENT')
    // A CONTENT type has no physical records table.
    assert.isFalse(await db.connection().schema.hasTable('cms_article_fields'))
  })

  test('collections + records export skips metadata-only types (no 500) and round-trips', async ({
    assert,
  }) => {
    // Enable ecommerce so a PRODUCT-type collection can be created.
    const { default: Module } = await import('#models/module')
    const { default: ModulesService } = await import('#services/modules_service')
    await Module.updateOrCreate(
      { name: 'ecommerce' },
      { id: 'test-ecommerce', name: 'ecommerce', enabled: true, version: '1.0.0' }
    )
    new ModulesService().bustCache()

    const cms = new CmsService()
    await cms.createCollection({
      key: 'article_fields',
      label: 'Article Fields',
      type: 'CONTENT',
      fields: [{ key: 'subtitle', label: 'Subtitle', type: 'TEXT' }],
    })
    await cms.createCollection({
      key: 'product_fields',
      label: 'Product Fields',
      type: 'PRODUCT',
      fields: [{ key: 'care', label: 'Care', type: 'TEXT' }],
    })
    await cms.createCollection({
      key: 'authors',
      label: 'Authors',
      draftsOn: false,
      fields: [{ key: 'name', label: 'Name', type: 'TEXT', required: true }],
    })
    await cms.createRecord('authors', null, { data: { name: 'Ada' } })

    // This is exactly the export that used to 500: `collection_records` iterated
    // the metadata-only collections and threw. It must now succeed.
    const archive = await new SiteExportService().export({
      only: ['collections', 'collection_records'],
    })
    assert.isTrue(archive.length > 0)

    // Hard-wipe all three, then re-import from the archive.
    for (const key of ['article_fields', 'product_fields', 'authors']) {
      await cms.deleteCollection(key)
      await cms.forceDeleteCollection(key)
    }
    await new SiteImportService().import(archive, { authorId: null })

    // Metadata-only schemas round-trip with their type and no physical table.
    const articleCol = await cms.findCollection('article_fields')
    const productCol = await cms.findCollection('product_fields')
    const authorsCol = await cms.findCollection('authors')
    assert.equal(articleCol.type, 'CONTENT')
    assert.equal(productCol.type, 'PRODUCT')
    assert.isFalse(await db.connection().schema.hasTable('cms_product_fields'))
    // The records collection and its row come back intact.
    assert.equal(authorsCol.type, 'COLLECTION')
    const recs = await cms.listRecords('authors', { pageSize: 10 }, { resolveRelations: false })
    assert.isTrue(recs.items.some((r) => r.data.name === 'Ada'))
  })

  test('kits section exports installed kits as base64 archives', async ({ assert }) => {
    const ctx = {
      mode: 'preserve' as const,
      selected: new Set<string>(),
      isSelected: () => true,
      addMedia: () => null,
      addFile: () => {},
    }
    const out = (await kitsSection.export(ctx)) as { kits: Array<{ id: string; archive: string }> }
    assert.isTrue(out.kits.some((k) => k.id === 'example' && k.archive.length > 0))
  })

  test('kits section stages a kit archive to disk on import', async ({ assert }) => {
    const kitSvc = new TemplateKitsService()
    const exampleArchive = await kitSvc.exportKit('example')
    const importedId = 'sitebackup-kit-test'
    const dest = join(app.makePath('inertia/custom/kits'), importedId)
    await rm(dest, { recursive: true, force: true })
    try {
      const logs: string[] = []
      const ctx = {
        mode: 'preserve' as const,
        conflict: 'overwrite' as const,
        idMap: new Map<string, string>(),
        resolveMediaRef: () => null,
        authorId: null,
        getFile: () => undefined,
        log: (l: string) => logs.push(l),
      }
      const report = await kitsSection.import(ctx, {
        kits: [{ id: importedId, archive: exampleArchive.toString('base64') }],
      })
      assert.equal(report.created, 1)
      assert.isTrue(existsSync(join(dest, 'kit.json')))
      assert.isTrue(logs.some((l) => l.includes('rebuild')))
    } finally {
      await rm(dest, { recursive: true, force: true })
    }
  })
})

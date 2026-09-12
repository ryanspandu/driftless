import { test } from '@japa/runner'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import testUtils from '@adonisjs/core/services/test_utils'
import RedirectsService from '#services/redirects_service'
import Redirect from '#models/redirect'
import Media from '#models/media'
import MediaService from '#services/media_service'
import CmsService from '#services/cms_service'
import Page from '#models/page'
import Template from '#models/template'
import { newUlid } from '#services/ulid_service'
import { WebSettingsService } from '#services/settings_service'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'
import { readArchive } from '#services/data_transfer/bundle'
import { parseManifest } from '#services/data_transfer/manifest'
import { assertNoSecrets } from '#services/data_transfer/secrets'

/**
 * Phase 1a of the whole-site export/import engine: the archive round-trips core
 * config sections (settings, redirects), never leaks a secret, and honours
 * dry-run. Larger sections (media, pages, templates, collections, records,
 * ecommerce) land in later phases against this same harness.
 */
test.group('Data transfer | core round-trip', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    registerCoreDataSections() // idempotent — ensures sections exist regardless of boot
    return cleanup
  })

  test('export → import restores a redirect (preserve + overwrite)', async ({ assert }) => {
    await new RedirectsService().create({ fromPath: '/old', toPath: '/new', status: 301 })

    const archive = await new SiteExportService().export()

    const files = await readArchive(archive)
    const manifest = parseManifest(JSON.parse(files.get('manifest.json')!.toString('utf8')))
    assert.equal(manifest._type, 'driftless.archive')
    assert.isTrue(manifest.sections.some((s) => s.name === 'redirects'))

    await Redirect.query().delete()
    assert.lengthOf(await Redirect.query(), 0)

    const result = await new SiteImportService().import(archive)
    // fromPath is normalized (slashes stripped) → '/old' is stored as 'old'.
    const rows = await Redirect.query().where('from_path', 'old')
    assert.lengthOf(rows, 1)
    assert.equal(rows[0]!.toPath, '/new')
    assert.isTrue(result.sections.some((s) => s.name === 'redirects' && s.created === 1))
  })

  test('settings export carries no secret keys', async ({ assert }) => {
    await new WebSettingsService().applyPatches([
      { section: 'theme', key: 'primary_color', value: '#123456' },
      { section: 'auth', key: 'captcha_secret_enc', value: 'ciphertext-that-must-not-travel' },
    ])

    const archive = await new SiteExportService().export({ only: ['settings'] })
    const files = await readArchive(archive)
    const settings = JSON.parse(files.get('sections/settings.json')!.toString('utf8'))

    assertNoSecrets(settings) // throws if any *_enc / secret key leaked
    assert.equal(settings.sections.theme.primary_color, '#123456')
  })

  test('dry-run reports without writing', async ({ assert }) => {
    await new RedirectsService().create({ fromPath: '/a', toPath: '/b' })
    const archive = await new SiteExportService().export({ only: ['redirects'] })
    await Redirect.query().delete()

    const result = await new SiteImportService().import(archive, { dryRun: true })
    assert.isTrue(result.dryRun)
    assert.lengthOf(await Redirect.query(), 0)
    // The dry-run preview reports the row count per section (no writes).
    assert.isTrue(result.log.some((l) => /would import 1 row/.test(l)))
  })

  test('media round-trips original file bytes + rows (preserve ids)', async ({ assert }) => {
    const svc = new MediaService()
    await mkdir(svc.storagePath, { recursive: true })
    const id = newUlid()
    const filename = `${id}.txt`
    await writeFile(join(svc.storagePath, filename), 'hello-media')
    await Media.create({
      id,
      filename,
      mimeType: 'text/plain',
      size: 11,
      url: `/uploads/${filename}`,
      origin: 'upload',
    })

    const archive = await new SiteExportService().export({ only: ['media'] })

    await Media.query().delete()
    await rm(join(svc.storagePath, filename), { force: true })

    const result = await new SiteImportService().import(archive)
    const restored = await Media.query().where('id', id).first()
    assert.isNotNull(restored)
    assert.equal(restored!.filename, filename)
    assert.equal(await readFile(join(svc.storagePath, filename), 'utf8'), 'hello-media')
    assert.isTrue(result.sections.some((s) => s.name === 'media' && s.created === 1))
  })

  test('collection schema + records round-trip (relation-safe)', async ({ assert }) => {
    const cms = new CmsService()
    await cms.createCollection({
      key: 'authors',
      label: 'Authors',
      draftsOn: false,
      fields: [{ key: 'name', label: 'Name', type: 'TEXT', required: true }],
    })
    await cms.createRecord('authors', null, { data: { name: 'Ada' } })

    const archive = await new SiteExportService().export({
      only: ['collections', 'collection_records'],
    })

    // Hard-wipe the collection (drops its dynamic table + frees the key).
    await cms.deleteCollection('authors')
    await cms.forceDeleteCollection('authors')

    const result = await new SiteImportService().import(archive)
    const cols = await cms.listCollections()
    assert.isTrue(cols.some((c) => c.key === 'authors'))
    const recs = await cms.listRecords('authors', { pageSize: 10 }, { resolveRelations: false })
    assert.isTrue(recs.items.some((r) => r.data.name === 'Ada'))
    assert.isTrue(result.sections.some((s) => s.name === 'collections' && s.created === 1))
    assert.isTrue(result.sections.some((s) => s.name === 'collection_records' && s.created === 1))
  })

  test('pages + templates round-trip with refs preserved', async ({ assert }) => {
    const tpl = await Template.create({
      id: newUlid(),
      name: 'Header',
      type: 'HEADER',
      content: { content: [], root: {} },
      renderedHtml: null,
      collectionKey: null,
      isDefault: false,
    })
    const page = await Page.create({
      id: newUlid(),
      title: 'DT Test Page',
      path: 'dt-export-test',
      status: 'DRAFT',
      renderMode: 'SSR',
      kind: 'BUILDER',
      component: null,
      content: { content: [], root: {} },
      seo: {},
      layoutId: null,
      headerTemplateId: tpl.id,
      footerTemplateId: null,
      hideHeader: false,
      hideFooter: false,
      authorId: null,
    })

    const archive = await new SiteExportService().export({ only: ['templates', 'pages'] })

    // Delete only what this test created (seeded pages are upserted by id).
    await Page.query().where('id', page.id).delete()
    await Template.query().where('id', tpl.id).delete()

    await new SiteImportService().import(archive)
    const restoredPage = await Page.query().where('id', page.id).first()
    assert.isNotNull(restoredPage)
    assert.equal(restoredPage!.headerTemplateId, tpl.id) // template ref preserved
    assert.isNotNull(await Template.query().where('id', tpl.id).first())
  })

  test('regenerate mode mints new ids and rewrites refs (duplicate into same site)', async ({
    assert,
  }) => {
    const tpl = await Template.create({
      id: newUlid(),
      name: 'RegenHeader',
      type: 'HEADER',
      content: { content: [], root: {} },
      renderedHtml: null,
      collectionKey: null,
      isDefault: false,
    })
    await Page.create({
      id: newUlid(),
      title: 'Regen',
      path: 'regen-src',
      status: 'DRAFT',
      renderMode: 'SSR',
      kind: 'BUILDER',
      component: null,
      content: {
        content: [{ type: 'TemplateRef', props: { id: 'a', templateId: tpl.id } }],
        root: {},
      },
      seo: {},
      layoutId: null,
      headerTemplateId: tpl.id,
      footerTemplateId: null,
      hideHeader: false,
      hideFooter: false,
      authorId: null,
    })

    const archive = await new SiteExportService().export({ only: ['templates', 'pages'] })
    await new SiteImportService().import(archive, { mode: 'regenerate' })

    // A fresh template (new id) and a page at a de-duped path.
    const newTpl = await Template.query()
      .where('name', 'RegenHeader')
      .whereNot('id', tpl.id)
      .first()
    assert.isNotNull(newTpl)
    const newPage = await Page.query().where('path', 'regen-src-2').first()
    assert.isNotNull(newPage)

    // Both the column ref AND the ref embedded in the Puck content point at the
    // new template id, not the original.
    assert.equal(newPage!.headerTemplateId, newTpl!.id)
    const content = newPage!.content as { content: Array<{ props: { templateId: string } }> }
    assert.equal(content.content[0]!.props.templateId, newTpl!.id)
  })

  test('conflict "replace" wipes the section before importing', async ({ assert }) => {
    await new RedirectsService().create({ fromPath: '/keep', toPath: '/k' })
    const archive = await new SiteExportService().export({ only: ['redirects'] })
    // An extra row that is NOT in the archive; replace should remove it.
    await new RedirectsService().create({ fromPath: '/extra', toPath: '/e' })

    await new SiteImportService().import(archive, { conflict: 'replace' })

    const all = await Redirect.query()
    assert.lengthOf(all, 1)
    assert.equal(all[0]!.fromPath, 'keep')
  })

  test('a wrong _type is refused', async ({ assert }) => {
    await assert.rejects(
      () => new SiteImportService().import(Buffer.from('not a tar archive at all')),
      /./
    )
  })
})

import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import Page from '#models/page'
import WebSetting from '#models/web_setting'
import CmsService from '#services/cms_service'
import ContentPathsService from '#services/content_paths_service'
import CollectionDetailService from '#services/collection_detail_service'
import { WebSettingsService } from '#services/settings_service'
import { newUlid } from '#services/ulid_service'
import SiteExportService from '#services/data_transfer/site_export_service'
import SiteImportService from '#services/data_transfer/site_import_service'
import { registerCoreDataSections } from '#services/data_transfer/core_sections'
import { packArchive, readArchive } from '#services/data_transfer/bundle'

/**
 * Whole-site export/import against the two features that add validated state:
 * the blog URL prefixes (`web_settings.content_paths`) and a collection's public
 * detail pages (`detail_*` columns). A validator that refuses on import must
 * never cost the operator the rest of the archive.
 */

const cms = new CmsService()
const settings = new WebSettingsService()

const FIELDS = [
  { key: 'title', label: 'Title', type: 'TEXT' as const, required: true },
  { key: 'slug', label: 'Slug', type: 'SLUG' as const, unique: true },
]

async function reset() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  registerCoreDataSections() // idempotent — sections exist regardless of boot
  // `truncate` empties rows but keeps dynamic tables; start every test clean.
  for (const key of ['portfolio', 'cases']) {
    await db.connection().schema.dropTableIfExists(`cms_${key}`)
  }
  return cleanup
}

async function codePage(path: string, overrides: Record<string, unknown> = {}) {
  return Page.create({
    id: newUlid(),
    title: `Template ${path}`,
    path,
    status: 'PUBLISHED',
    renderMode: 'SSR',
    kind: 'CODE',
    component: 'x',
    content: { root: {}, content: [] },
    seo: {},
    ...overrides,
  } as never)
}

async function portfolio(
  opts: { prefix?: string | null; pageId?: string | null; on?: boolean } = {}
) {
  return cms.createCollection({
    key: 'portfolio',
    label: 'Portfolio',
    draftsOn: false,
    detailPagesOn: opts.on ?? true,
    detailPathPrefix: opts.prefix === undefined ? 'portfolio' : opts.prefix,
    detailPageId: opts.pageId ?? null,
    fields: FIELDS,
  })
}

async function wipeCollection(key: string) {
  await cms.deleteCollection(key)
  await cms.forceDeleteCollection(key)
}

/** Rewrite one section file of an archive (to simulate an older or hand-edited export). */
async function tamper(
  archive: Buffer,
  file: string,
  edit: (json: Record<string, any>) => void
): Promise<Buffer> {
  const files = await readArchive(archive)
  const json = JSON.parse(files.get(file)!.toString('utf8'))
  edit(json)
  files.set(file, Buffer.from(JSON.stringify(json)))
  return packArchive([...files.entries()].map(([name, content]) => ({ name, content })))
}

const urls = () => new ContentPathsService().get()
const prefixOf = async (kind: 'archive' | 'detail' | 'category' | 'tag') => {
  const paths = await urls()
  return paths[kind]
}
const detailPrefixOf = async (key: string) => {
  const collection = await cms.findCollection(key)
  return collection.detailPathPrefix
}

test.group('Data transfer | blog URL prefixes (content_paths)', (group) => {
  group.each.setup(async () => reset())

  test('round-trips in preserve and regenerate mode', async ({ assert }) => {
    await settings.applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: 'insights' },
      { section: 'content_paths', key: 'post_detail_prefix', value: 'insights' },
      { section: 'content_paths', key: 'category_prefix', value: 'topics' },
    ])
    const archive = await new SiteExportService().export({ only: ['settings'] })

    for (const mode of ['preserve', 'regenerate'] as const) {
      await WebSetting.query().where('section', 'content_paths').delete()
      assert.equal(await prefixOf('archive'), 'blog')
      await new SiteImportService().import(archive, { mode })
      const restored = await urls()
      assert.equal(restored.archive, 'insights')
      assert.equal(restored.detail, 'insights')
      assert.equal(restored.category, 'topics')
    }
  })

  test('a page on the moved prefix does not cost the other settings (regression)', async ({
    assert,
  }) => {
    await settings.applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: 'insights' },
      { section: 'theme', key: 'primary_color', value: '#123456' },
    ])
    // A page on the prefix is a legitimate source state (it wins over the screen).
    await codePage('insights')
    const archive = await new SiteExportService().export({ only: ['pages', 'settings'] })

    await settings.applyPatches([{ section: 'theme', key: 'primary_color', value: '' }])
    await WebSetting.query().where('section', 'content_paths').delete()

    const result = await new SiteImportService().import(archive)
    assert.notInclude(result.log.join('\n'), '✗ settings failed')
    const sections = await settings.getMergedSections()
    assert.equal(sections['theme']!['primary_color'], '#123456')
    assert.equal(await prefixOf('archive'), 'insights')
  })

  test('an unusable prefix is a warning, and every other setting still imports', async ({
    assert,
  }) => {
    await settings.applyPatches([{ section: 'theme', key: 'primary_color', value: '#123456' }])
    const archive = await tamper(
      await new SiteExportService().export({ only: ['settings'] }),
      'sections/settings.json',
      (json) => {
        json.sections.content_paths.posts_archive_prefix = 'admin' // reserved
      }
    )
    await settings.applyPatches([{ section: 'theme', key: 'primary_color', value: '' }])

    const result = await new SiteImportService().import(archive)
    const sections = await settings.getMergedSections()
    assert.equal(sections['theme']!['primary_color'], '#123456')
    assert.equal(await prefixOf('archive'), 'blog')
    const report = result.sections.find((s) => s.name === 'settings')!
    assert.isTrue(report.warnings.some((w) => w.includes('reserved')))
    // …and the operator is told in the log, not only in the JSON result.
    assert.isTrue(result.log.some((l) => l.startsWith('⚠ settings')))
  })

  test('skip keeps the target’s own URLs and role pages', async ({ assert }) => {
    const archive = await new SiteExportService().export({ only: ['settings'] }) // defaults
    await settings.applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: 'insights' },
    ])
    await new SiteImportService().import(archive, { conflict: 'skip' })
    assert.equal(await prefixOf('archive'), 'insights')
  })

  test('re-importing unchanged URLs does not throw away cached pages', async ({ assert }) => {
    const page = await codePage('cached', {
      renderMode: 'SSG',
      renderedHtml: '<p>cached</p>',
      renderedBuild: 'x',
    })
    const archive = await new SiteExportService().export({ only: ['settings'] })
    await new SiteImportService().import(archive)
    await page.refresh()
    assert.equal(page.renderedHtml, '<p>cached</p>')
  })

  test('an archive without content_paths (older export) imports fine', async ({ assert }) => {
    const archive = await tamper(
      await new SiteExportService().export({ only: ['settings'] }),
      'sections/settings.json',
      (json) => {
        delete json.sections.content_paths
      }
    )
    const result = await new SiteImportService().import(archive)
    assert.notInclude(result.log.join('\n'), '✗')
    assert.equal(await prefixOf('archive'), 'blog')
  })

  test('a dry run warns about a prefix the import would refuse, and writes nothing', async ({
    assert,
  }) => {
    const archive = await tamper(
      await new SiteExportService().export({ only: ['settings'] }),
      'sections/settings.json',
      (json) => {
        json.sections.content_paths.posts_archive_prefix = 'admin'
      }
    )
    const result = await new SiteImportService().import(archive, { dryRun: true })
    assert.isTrue(result.log.some((l) => l.includes('[dry-run] warning (settings)')))
    assert.equal(await prefixOf('archive'), 'blog')
  })

  test('role pointers are remapped in regenerate mode, including the two blog roles', async ({
    assert,
  }) => {
    const page = await codePage('archive-template')
    await settings.applyPatches([
      { section: 'content_pages', key: 'posts_archive_page_id', value: page.id },
      { section: 'content_pages', key: 'post_detail_page_id', value: page.id },
    ])
    const archive = await new SiteExportService().export({ only: ['pages', 'settings'] })
    await page.delete()
    await WebSetting.query().where('section', 'content_pages').delete()

    await new SiteImportService().import(archive, { mode: 'regenerate' })
    const fresh = await Page.query().where('path', 'archive-template').firstOrFail()
    assert.notEqual(fresh.id, page.id)
    const sections = await settings.getMergedSections()
    assert.equal(sections['content_pages']!['posts_archive_page_id'], fresh.id)
    assert.equal(sections['content_pages']!['post_detail_page_id'], fresh.id)
  })
})

test.group('Data transfer | collection public detail pages', (group) => {
  group.each.setup(async () => reset())

  const SECTIONS = ['collections', 'collection_records', 'pages', 'settings', 'collection_detail']

  async function seedSource() {
    const template = await codePage('portfolio-case')
    await portfolio({ pageId: template.id })
    await cms.createRecord('portfolio', null, {
      data: { title: 'Rapid Plumbing' },
      status: 'PUBLISHED',
    })
    return template
  }

  test('preserve: the template pointer and the URLs come back', async ({ assert }) => {
    const template = await seedSource()
    const archive = await new SiteExportService().export({ only: SECTIONS })
    await wipeCollection('portfolio')
    await template.delete()

    const result = await new SiteImportService().import(archive)
    assert.notInclude(result.log.join('\n'), '✗')
    const restored = await cms.findCollection('portfolio')
    assert.isTrue(restored.detailPagesOn)
    assert.equal(restored.detailPathPrefix, 'portfolio')
    assert.equal(restored.detailPageId, template.id)
    assert.isNotNull(await new CollectionDetailService().resolve('portfolio/rapid-plumbing'))
  })

  test('regenerate: the pointer follows the page to its NEW id (regression)', async ({
    assert,
  }) => {
    const template = await seedSource()
    // No media in this archive: the id map holds nothing when collections import.
    const archive = await new SiteExportService().export({ only: SECTIONS })
    await wipeCollection('portfolio')
    await template.delete()

    await new SiteImportService().import(archive, { mode: 'regenerate' })
    const fresh = await Page.query().where('path', 'portfolio-case').firstOrFail()
    assert.notEqual(fresh.id, template.id)
    const restored = await cms.findCollection('portfolio')
    assert.equal(restored.detailPageId, fresh.id)
    assert.isNotNull(await new CollectionDetailService().resolve('portfolio/rapid-plumbing'))
  })

  test('a prefix the blog now uses never costs the collection (regression)', async ({ assert }) => {
    // Source: the blog moved to /insights, so a collection may take /blog.
    await settings.applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: 'insights' },
    ])
    const template = await codePage('case-template')
    await portfolio({ prefix: 'blog', pageId: template.id })
    await cms.createRecord('portfolio', null, { data: { title: 'One' }, status: 'PUBLISHED' })
    const archive = await new SiteExportService().export({ only: SECTIONS })

    await wipeCollection('portfolio')
    await WebSetting.query().where('section', 'content_paths').delete()
    await template.delete()

    // Into a fresh site the blog is still /blog when collections import (order 30);
    // settings (70) then moves it, and the detail settings (74) fit again.
    const result = await new SiteImportService().import(archive)
    const restored = await cms.findCollection('portfolio')
    assert.isNotNull(restored)
    const records = await cms.listRecords('portfolio', { pageSize: 10 })
    assert.lengthOf(records.items, 1)
    assert.isTrue(restored.detailPagesOn)
    assert.equal(restored.detailPathPrefix, 'blog')
    assert.notInclude(result.log.join('\n'), '✗')
  })

  test('a prefix clash on the target leaves the collection there with the feature off', async ({
    assert,
  }) => {
    const template = await codePage('case-template')
    await portfolio({ pageId: template.id })
    const archive = await new SiteExportService().export({
      only: ['collections', 'collection_records', 'collection_detail'],
    })
    await wipeCollection('portfolio')
    // The target's blog now lives on the collection's prefix.
    await settings.applyPatches([
      { section: 'content_paths', key: 'posts_archive_prefix', value: 'portfolio' },
    ])

    const result = await new SiteImportService().import(archive)
    const restored = await cms.findCollection('portfolio')
    assert.isFalse(restored.detailPagesOn)
    assert.isTrue(result.log.some((l) => l.startsWith('⚠ collection_detail')))
  })

  test('an archive from before this feature imports with the pages off', async ({ assert }) => {
    await seedSource()
    const archive = await new SiteExportService().export({ only: ['collections'] })
    await wipeCollection('portfolio')
    await new SiteImportService().import(archive)
    const restored = await cms.findCollection('portfolio')
    assert.isFalse(restored.detailPagesOn)
    assert.isNull(restored.detailPathPrefix)
  })

  test('conflict: overwrite applies the archive, skip keeps what the target has', async ({
    assert,
  }) => {
    const template = await codePage('case-template')
    await portfolio({ pageId: template.id })
    const archive = await new SiteExportService().export({ only: SECTIONS })

    await cms.updateCollection('portfolio', { detailPathPrefix: 'work' })
    await new SiteImportService().import(archive, { conflict: 'skip', only: ['collection_detail'] })
    assert.equal(await detailPrefixOf('portfolio'), 'work')

    await new SiteImportService().import(archive, {
      conflict: 'overwrite',
      only: ['collection_detail'],
    })
    assert.equal(await detailPrefixOf('portfolio'), 'portfolio')
  })

  test('a dry run warns when a collection’s pages cannot be restored', async ({ assert }) => {
    const template = await codePage('case-template')
    await portfolio({ pageId: template.id })
    const archive = await tamper(
      await new SiteExportService().export({ only: ['collection_detail'] }),
      'sections/collection_detail.json',
      (json) => {
        json.collections[0].detailPathPrefix = 'admin'
      }
    )
    const result = await new SiteImportService().import(archive, { dryRun: true })
    assert.isTrue(result.log.some((l) => l.includes('[dry-run] warning (collection_detail)')))
  })
})

test.group('Data transfer | per-collection JSON import', (group) => {
  group.each.setup(async () => reset())

  test('public pages that this site cannot host are left off, with the reason', async ({
    client,
    assert,
  }) => {
    const admin = await User.query().where('email', 'admin@driftless.local').firstOrFail()
    // Exported from a site where the collection had public pages; here it has no slug field.
    const res = await client
      .post('/api/admin/cms/collections')
      .loginAs(admin)
      .json({
        key: 'cases',
        label: 'Cases',
        detailPagesOn: true,
        detailPathPrefix: 'cases',
        fields: [{ key: 'title', label: 'Title', type: 'TEXT' }],
      })
    res.assertStatus(201)
    assert.isFalse(res.body().detailPagesOn)
    assert.match(res.body().warnings[0], /slug field/)
    const created = await cms.findCollection('cases')
    assert.equal(created.key, 'cases')
  })

  test('an ordinary invalid request is still a 422', async ({ client }) => {
    const admin = await User.query().where('email', 'admin@driftless.local').firstOrFail()
    const res = await client
      .post('/api/admin/cms/collections')
      .loginAs(admin)
      .json({ key: 'Bad Key', label: 'Bad', fields: [] })
    res.assertStatus(422)
  })
})

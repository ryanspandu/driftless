import { test } from '@japa/runner'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import testUtils from '@adonisjs/core/services/test_utils'
import RedirectsService from '#services/redirects_service'
import Redirect from '#models/redirect'
import Media from '#models/media'
import MediaService from '#services/media_service'
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

  test('a wrong _type is refused', async ({ assert }) => {
    await assert.rejects(
      () => new SiteImportService().import(Buffer.from('not a tar archive at all')),
      /./
    )
  })
})

import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import TemplatesService from '#services/templates_service'
import TemplateKitsService from '#services/template_kits_service'
import { packArchive } from '#services/data_transfer/bundle'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

test.group('Template import / export', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a template round-trips through export → import as a new non-default row', async ({
    assert,
  }) => {
    const svc = new TemplatesService()
    const original = await svc.create({
      name: 'My Header',
      type: 'HEADER',
      content: { content: [{ type: 'Text', props: {} }], root: {} },
      isDefault: true,
    })

    const bundle = await svc.exportTemplate(original.id)
    assert.equal(bundle._type, 'driftless.template')
    assert.equal(bundle.type, 'HEADER')

    const imported = await svc.importTemplate(bundle)
    assert.notEqual(imported.id, original.id)
    assert.equal(imported.type, 'HEADER')
    // Imports are never the site default, even from a default source.
    assert.isFalse(imported.isDefault)
    assert.property(imported.content, 'content')
  })

  test('importing a non-template JSON is rejected', async ({ assert }) => {
    const svc = new TemplatesService()
    await assert.rejects(
      () => svc.importTemplate({ _type: 'driftless.page', title: 'x' }),
      /Driftless template export/i
    )
  })
})

test.group('Template kit import / export', () => {
  const svc = new TemplateKitsService()
  const kitsDir = app.makePath('inertia/custom/kits')

  test('the committed example kit exports and re-imports under a new id', async ({ assert }) => {
    const importedId = 'example-copy-test'
    const dest = join(kitsDir, importedId)
    await rm(dest, { recursive: true, force: true })
    try {
      const archive = await svc.exportKit('example')
      assert.isTrue(archive.length > 0)

      const result = await svc.importKit(archive, importedId)
      assert.equal(result.id, importedId)
      assert.isTrue(existsSync(join(dest, 'kit.json')))
    } finally {
      await rm(dest, { recursive: true, force: true })
    }
  })

  test('importing over the reserved example kit is refused', async ({ assert }) => {
    const archive = await svc.exportKit('example')
    await assert.rejects(() => svc.importKit(archive, 'example'), /reserved/i)
  })

  test('a traversal entry is dropped, and a bundle with no kit.json is refused', async ({
    assert,
  }) => {
    // Only a traversal entry, no kit.json — the guard drops the evil entry, so
    // import fails on the missing kit.json rather than writing outside the dir.
    const evil = await packArchive([
      { name: '../pwned.tsx', content: Buffer.from('export default () => null') },
    ])
    await assert.rejects(() => svc.importKit(evil, 'evil-kit-test'), /no kit\.json/i)
    assert.isFalse(existsSync(join(kitsDir, 'pwned.tsx')))
    assert.isFalse(existsSync(join(kitsDir, '..', 'pwned.tsx')))
  })
})

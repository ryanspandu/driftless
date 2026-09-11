import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { newUlid } from '#services/ulid_service'
import Media from '#models/media'
import MediaService from '#services/media_service'

/** A real 1×1 PNG so `fileTypeFromBuffer` sniffs it as image/png. */
const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

test.group('Media | per-item export/import', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    return cleanup
  })

  test('exportOne → importOne recreates the file + row with a fresh id', async ({ assert }) => {
    const svc = new MediaService()
    const bytes = Buffer.from(PNG_1X1_B64, 'base64')
    const id = newUlid()
    const filename = `${id}.png`
    const created: string[] = [filename]
    await mkdir(svc.storagePath, { recursive: true })
    await writeFile(join(svc.storagePath, filename), bytes)
    await Media.create({
      id,
      filename,
      mimeType: 'image/png',
      size: bytes.length,
      url: `/uploads/${filename}`,
      title: 'Hero',
      alt: 'A hero',
      origin: 'upload',
      authorId: null,
    })

    try {
      const bundle = await svc.exportOne(id)
      assert.equal(bundle._type, 'driftless.media')
      assert.equal((bundle.media as { filename: string }).filename, filename)
      assert.isTrue(bundle.file.base64.length > 0)

      const imported = await svc.importOne(null, bundle)
      created.push(imported.filename)
      // A fresh id/filename — a per-item import is a create, never an overwrite.
      assert.notEqual(imported.id, id)
      assert.notEqual(imported.filename, filename)
      assert.equal(imported.mimeType, 'image/png')
      assert.equal(imported.title, 'Hero')
      assert.equal(imported.alt, 'A hero')

      // Bytes are identical on disk.
      const importedBytes = await readFile(join(svc.storagePath, imported.filename))
      assert.equal(importedBytes.toString('base64'), bytes.toString('base64'))

      // The row is queryable.
      assert.isNotNull(await Media.query().where('id', imported.id).first())
    } finally {
      for (const f of created) await rm(join(svc.storagePath, f), { force: true })
    }
  })

  test('importOne rejects a payload that is not a media export', async ({ assert }) => {
    const svc = new MediaService()
    await assert.rejects(
      () => svc.importOne(null, { _type: 'driftless.page' }),
      /Not a Driftless media export/i
    )
  })

  test('importOne rejects bytes that are not an allowed file type', async ({ assert }) => {
    const svc = new MediaService()
    const bundle = {
      _type: 'driftless.media',
      version: 1,
      media: { filename: 'evil.png', mimeType: 'image/png' },
      file: { base64: Buffer.from('not an image').toString('base64'), encoding: 'base64' as const },
    }
    await assert.rejects(() => svc.importOne(null, bundle), /allowed file type/i)
  })
})

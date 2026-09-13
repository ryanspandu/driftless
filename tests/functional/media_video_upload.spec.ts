import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile, rm } from 'node:fs/promises'
import User from '#models/user'
import Module from '#models/module'
import ModulesService from '#services/modules_service'

/**
 * Video upload support: `video/mp4`/`video/webm` are now accepted through the
 * shared magic-byte gate (`MediaService`'s `UPLOAD_ALLOWED_MIMES`, via the
 * `file-type` package) on both the admin and MCP upload endpoints, and
 * `GET /api/admin/media/:id` (previously an unrouted, dead controller method)
 * is now reachable — needed by the new CMS Media-field picker to resolve a
 * stored id back to a preview.
 */

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

async function token(abilities: string[]): Promise<string> {
  const t = await User.accessTokens.create(await admin(), abilities, { name: 'test' })
  return t.value!.release()
}
const bearer = (t: string) => `Bearer ${t}`

async function enableMcp() {
  await new ModulesService().setEnabled('mcp', true)
  await Module.updateOrCreate({ name: 'mcp' }, { name: 'mcp', enabled: true, version: '1.0.0' })
  new ModulesService().bustCache()
}

/** A minimal, but byte-valid, MP4 container — just enough for `file-type` to detect it. */
function minimalMp4(): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]), // box size = 24
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'), // major brand
    Buffer.from([0x00, 0x00, 0x02, 0x00]), // minor version
    Buffer.from('isomiso2', 'ascii'), // compatible brands
  ])
}

/** A minimal, but byte-valid, WebM (EBML) header — just enough for `file-type` to detect it. */
function minimalWebm(): Buffer {
  return Buffer.from([
    0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81,
    0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d,
  ])
}

async function writeTemp(name: string, bytes: Buffer): Promise<string> {
  const p = join(tmpdir(), `dl-video-${Date.now()}-${name}`)
  await writeFile(p, bytes)
  return p
}

test.group('Media | video upload', (group) => {
  group.each.setup(async () => resetDatabase())

  test('POST /api/admin/media accepts an mp4 upload', async ({ client, assert }) => {
    const path = await writeTemp('clip.mp4', minimalMp4())
    try {
      const res = await client
        .post('/api/admin/media')
        .file('file', path)
        .loginAs(await admin())
      res.assertStatus(201)
      assert.equal(res.body().mimeType, 'video/mp4')
    } finally {
      await rm(path, { force: true })
    }
  })

  test('POST /api/admin/media accepts a webm upload', async ({ client, assert }) => {
    const path = await writeTemp('clip.webm', minimalWebm())
    try {
      const res = await client
        .post('/api/admin/media')
        .file('file', path)
        .loginAs(await admin())
      res.assertStatus(201)
      assert.equal(res.body().mimeType, 'video/webm')
    } finally {
      await rm(path, { force: true })
    }
  })

  test('a still-disallowed file type is rejected', async ({ client }) => {
    // Random bytes matching no known file signature.
    const path = await writeTemp('nope.bin', Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]))
    try {
      const res = await client
        .post('/api/admin/media')
        .file('file', path)
        .loginAs(await admin())
      res.assertStatus(422)
    } finally {
      await rm(path, { force: true })
    }
  })

  test('GET /api/admin/media/:id returns the record (previously unrouted)', async ({
    client,
    assert,
  }) => {
    const path = await writeTemp('clip2.mp4', minimalMp4())
    try {
      const created = await client
        .post('/api/admin/media')
        .file('file', path)
        .loginAs(await admin())
      created.assertStatus(201)
      const id = created.body().id as string

      const shown = await client.get(`/api/admin/media/${id}`).loginAs(await admin())
      shown.assertStatus(200)
      assert.equal(shown.body().id, id)
      assert.equal(shown.body().mimeType, 'video/mp4')
    } finally {
      await rm(path, { force: true })
    }
  })

  test('the MCP upload_media path (POST /api/mcp/v1/media) also accepts video', async ({
    client,
    assert,
  }) => {
    await enableMcp()
    const t = await token(['builder:media'])
    const path = await writeTemp('clip3.mp4', minimalMp4())
    try {
      const res = await client
        .post('/api/mcp/v1/media')
        .header('Authorization', bearer(t))
        .file('file', path)
      res.assertStatus(201)
      assert.equal(res.body().mimeType, 'video/mp4')
    } finally {
      await rm(path, { force: true })
    }
  })
})

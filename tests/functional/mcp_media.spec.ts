import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile, rm } from 'node:fs/promises'
import sharp from 'sharp'
import User from '#models/user'
import Module from '#models/module'
import ModulesService from '#services/modules_service'
import MediaService from '#services/media_service'
import { assertFetchableImageUrl, originForUrl } from '#modules/mcp/services/image_url_guard'

/**
 * MCP builder-API — media: upload provenance, crop_media, and the placeholder /
 * SSRF guard on the URL-fetch path. This is the exact surface that let a random
 * stock photo become a self-hosted "brand" asset.
 */
async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

async function enableMcp() {
  await new ModulesService().setEnabled('mcp', true)
  await Module.updateOrCreate({ name: 'mcp' }, { name: 'mcp', enabled: true, version: '1.0.0' })
  new ModulesService().bustCache()
}

async function token(abilities: string[]): Promise<string> {
  const t = await User.accessTokens.create(await admin(), abilities, { name: 'test' })
  return t.value!.release()
}
const bearer = (t: string) => `Bearer ${t}`

async function makePng(w: number, h: number): Promise<string> {
  const src = join(tmpdir(), `dl-media-${Date.now()}-${Math.round(w)}x${h}.png`)
  await writeFile(
    src,
    await sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 74, b: 62 } } })
      .png()
      .toBuffer()
  )
  return src
}

const cleanupMedia = async (id: string) => {
  const svc = new MediaService()
  await svc.remove(id).catch(() => {})
  await svc.forceDelete(id).catch(() => {})
}

test.group('MCP media | upload + provenance', (group) => {
  group.each.setup(async () => resetDatabase())

  test('a builder:media token uploads a file with provenance', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:media'])
    const src = await makePng(600, 400)
    let id = ''
    try {
      const res = await client
        .post('/api/mcp/v1/media')
        .header('Authorization', bearer(t))
        .field('origin', 'reference')
        .field('alt', 'the design mockup')
        .file('file', src)
      res.assertStatus(201)
      const body = res.body()
      id = body.id
      assert.match(body.url, /^\/(uploads|media)\//)
      assert.equal(body.origin, 'reference')
      assert.equal(body.alt, 'the design mockup')
    } finally {
      await rm(src, { force: true })
      if (id) await cleanupMedia(id)
    }
  })

  test('upload is refused without builder:media', async ({ client }) => {
    await enableMcp()
    const t = await token(['builder:read'])
    const src = await makePng(50, 50)
    try {
      const res = await client
        .post('/api/mcp/v1/media')
        .header('Authorization', bearer(t))
        .file('file', src)
      res.assertStatus(403)
    } finally {
      await rm(src, { force: true })
    }
  })
})

test.group('MCP media | crop_media', (group) => {
  group.each.setup(async () => resetDatabase())

  test('crop cuts a new asset out of an existing image', async ({ client, assert }) => {
    await enableMcp()
    const t = await token(['builder:media'])
    const src = await makePng(1000, 800)
    let sourceId = ''
    let cropId = ''
    try {
      const up = await client
        .post('/api/mcp/v1/media')
        .header('Authorization', bearer(t))
        .file('file', src)
      up.assertStatus(201)
      sourceId = up.body().id

      const res = await client
        .post(`/api/mcp/v1/media/${sourceId}/crop`)
        .header('Authorization', bearer(t))
        .json({ x: 100, y: 50, width: 400, height: 300 })
      res.assertStatus(201)
      const body = res.body()
      cropId = body.id
      assert.notEqual(cropId, sourceId)
      assert.equal(body.origin, 'crop')
      assert.equal(body.sourceMediaId, sourceId)
      assert.equal(body.width, 400)
      assert.equal(body.height, 300)
    } finally {
      await rm(src, { force: true })
      if (cropId) await cleanupMedia(cropId)
      if (sourceId) await cleanupMedia(sourceId)
    }
  })

  test('a crop rectangle outside the source is rejected', async ({ client }) => {
    await enableMcp()
    const t = await token(['builder:media'])
    const src = await makePng(300, 200)
    let sourceId = ''
    try {
      const up = await client
        .post('/api/mcp/v1/media')
        .header('Authorization', bearer(t))
        .file('file', src)
      sourceId = up.body().id
      const res = await client
        .post(`/api/mcp/v1/media/${sourceId}/crop`)
        .header('Authorization', bearer(t))
        .json({ x: 250, y: 0, width: 200, height: 100 })
      res.assertStatus(422)
    } finally {
      await rm(src, { force: true })
      if (sourceId) await cleanupMedia(sourceId)
    }
  })
})

test.group('MCP media | URL guard', () => {
  test('a placeholder host is refused unless purpose is placeholder', ({ assert }) => {
    assert.throws(() => assertFetchableImageUrl('https://picsum.photos/800/600', undefined))
    assert.throws(() => assertFetchableImageUrl('https://loremflickr.com/800/600/sofa', 'brand'))
    // With purpose:placeholder it is allowed, and recorded as a placeholder.
    const ok = assertFetchableImageUrl('https://picsum.photos/800/600', 'placeholder')
    assert.isTrue(ok.isPlaceholder)
    assert.equal(originForUrl('placeholder', true), 'placeholder')
  })

  test('private-network and non-http targets are refused', ({ assert }) => {
    assert.throws(() => assertFetchableImageUrl('http://169.254.169.254/latest/meta-data', undefined))
    assert.throws(() => assertFetchableImageUrl('http://127.0.0.1:3333/x.png', undefined))
    assert.throws(() => assertFetchableImageUrl('http://localhost/x.png', undefined))
    assert.throws(() => assertFetchableImageUrl('file:///etc/passwd', undefined))
  })

  test('a normal remote image URL passes and records origin url', ({ assert }) => {
    const ok = assertFetchableImageUrl('https://cdn.example.com/hero.jpg', 'brand')
    assert.isFalse(ok.isPlaceholder)
    assert.equal(originForUrl('brand', false), 'url')
  })
})

import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFile, rm } from 'node:fs/promises'
import sharp from 'sharp'
import User from '#models/user'
import MediaService from '#services/media_service'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

test.group('Media | responsive variants', (group) => {
  group.each.setup(async () => resetDatabase())

  test('an uploaded raster image gets webp variants + real dimensions', async ({
    client,
    assert,
  }) => {
    // A 1200×800 PNG on disk to upload.
    const src = join(tmpdir(), `dl-test-${Date.now()}.png`)
    await writeFile(
      src,
      await sharp({
        create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 60, b: 60 } },
      })
        .png()
        .toBuffer()
    )

    let uploadedId = ''
    try {
      const res = await client
        .post('/api/admin/media')
        .file('file', src)
        .loginAs(await admin())
      res.assertStatus(201)
      const body = res.body()
      uploadedId = body.id

      // Real intrinsic size came from sharp, not the (absent) client dims.
      assert.equal(body.width, 1200)
      assert.equal(body.height, 800)

      // Variants generated: the presets that fit (480, 960) + the original width.
      const widths = (body.variants as { width: number; format: string; url: string }[]).map(
        (v) => v.width
      )
      assert.includeMembers(widths, [480, 960, 1200])
      assert.isTrue((body.variants as { format: string }[]).every((v) => v.format === 'webp'))

      // A variant is actually servable as webp.
      const variantUrl = (body.variants as { url: string }[])[0]!.url
      const served = await client.get(variantUrl)
      served.assertStatus(200)
      assert.equal(served.header('content-type'), 'image/webp')
    } finally {
      await rm(src, { force: true })
      if (uploadedId) {
        // Clean the files off disk (soft-delete then force).
        const svc = new MediaService()
        await svc.remove(uploadedId).catch(() => {})
        await svc.forceDelete(uploadedId).catch(() => {})
      }
    }
  })
})

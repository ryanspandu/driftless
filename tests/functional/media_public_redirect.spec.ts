import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import env from '#start/env'
import Media from '#models/media'
import MediaVariant from '#models/media_variant'
import { mediaUrlPrefix } from '#services/media_url'

/**
 * With STORAGE_DRIVER=s3 and S3_PUBLIC_URL set, public images/video are redirected to the bucket
 * so their bytes never pass through the app. Nothing here reaches a real bucket: the redirect
 * decision is made before any driver call.
 */
const BASE = 'https://cdn.example.test'

function withEnv(values: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(values)) {
    previous[k] = env.get(k as never) as string | undefined
    env.set(k as never, v as never)
  }
  return () => {
    for (const [k, v] of Object.entries(previous)) env.set(k as never, v as never)
  }
}

async function makeMedia(filename: string, mimeType: string) {
  return Media.create({
    id: filename.split('.')[0],
    filename,
    mimeType,
    size: 10,
    url: `${mediaUrlPrefix()}/${filename}`,
    authorId: null,
  })
}

test.group('Media | public bucket redirect', (group) => {
  group.each.setup(async () => testUtils.db().truncate())

  test('redirects a raster original to the bucket and forwards the cache-busting query', async ({
    client,
    assert,
  }) => {
    const restore = withEnv({ STORAGE_DRIVER: 's3', S3_PUBLIC_URL: `${BASE}/` })
    try {
      await makeMedia('01HZ3K7M8Q9R2S4T5V6W7X8Y9A.jpg', 'image/jpeg')
      const res = await client
        .get(`${mediaUrlPrefix()}/01HZ3K7M8Q9R2S4T5V6W7X8Y9A.jpg?v=123`)
        .redirects(0)
      res.assertStatus(302)
      assert.equal(res.header('location'), `${BASE}/01HZ3K7M8Q9R2S4T5V6W7X8Y9A.jpg?v=123`)
    } finally {
      restore()
    }
  })

  test('redirects a known webp derivative', async ({ client, assert }) => {
    const restore = withEnv({ STORAGE_DRIVER: 's3', S3_PUBLIC_URL: BASE })
    try {
      const media = await makeMedia('01HZ3K7M8Q9R2S4T5V6W7X8Y9B.png', 'image/png')
      await MediaVariant.create({
        id: '01HZ3K7M8Q9R2S4T5V6W7X8Y9V',
        mediaId: media.id,
        width: 480,
        height: 320,
        format: 'webp',
        url: `${mediaUrlPrefix()}/01HZ3K7M8Q9R2S4T5V6W7X8Y9V.webp`,
        bytes: 5,
      })
      const res = await client
        .get(`${mediaUrlPrefix()}/01HZ3K7M8Q9R2S4T5V6W7X8Y9V.webp`)
        .redirects(0)
      res.assertStatus(302)
      assert.equal(res.header('location'), `${BASE}/01HZ3K7M8Q9R2S4T5V6W7X8Y9V.webp`)
    } finally {
      restore()
    }
  })

  test('never redirects a key that is not a media row or derivative', async ({ client }) => {
    const restore = withEnv({ STORAGE_DRIVER: 's3', S3_PUBLIC_URL: BASE })
    try {
      const res = await client
        .get(`${mediaUrlPrefix()}/ecommerce/01HZ3K7M8Q9R2S4T5V6W7X8Y9Z.zip`)
        .redirects(0)
      res.assertStatus(404)
    } finally {
      restore()
    }
  })

  test('types that need the app’s headers (SVG, PDF) are not redirected', async ({
    client,
    assert,
  }) => {
    const restore = withEnv({ STORAGE_DRIVER: 's3', S3_PUBLIC_URL: BASE })
    try {
      await makeMedia('01HZ3K7M8Q9R2S4T5V6W7X8Y9C.pdf', 'application/pdf')
      const res = await client
        .get(`${mediaUrlPrefix()}/01HZ3K7M8Q9R2S4T5V6W7X8Y9C.pdf`)
        .redirects(0)
      assert.notEqual(res.status(), 302)
    } finally {
      restore()
    }
  })

  test('without S3_PUBLIC_URL nothing is redirected', async ({ client, assert }) => {
    const restore = withEnv({ STORAGE_DRIVER: 's3', S3_PUBLIC_URL: undefined })
    try {
      await makeMedia('01HZ3K7M8Q9R2S4T5V6W7X8Y9D.jpg', 'image/jpeg')
      const res = await client
        .get(`${mediaUrlPrefix()}/01HZ3K7M8Q9R2S4T5V6W7X8Y9D.jpg`)
        .redirects(0)
      assert.notEqual(res.status(), 302)
    } finally {
      restore()
    }
  })

  test('local storage never redirects even if S3_PUBLIC_URL is set', async ({ client, assert }) => {
    const restore = withEnv({ STORAGE_DRIVER: 'local', S3_PUBLIC_URL: BASE })
    try {
      await makeMedia('01HZ3K7M8Q9R2S4T5V6W7X8Y9E.jpg', 'image/jpeg')
      const res = await client
        .get(`${mediaUrlPrefix()}/01HZ3K7M8Q9R2S4T5V6W7X8Y9E.jpg`)
        .redirects(0)
      assert.notEqual(res.status(), 302)
    } finally {
      restore()
    }
  })
})

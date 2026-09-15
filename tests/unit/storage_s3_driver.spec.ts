import { test } from '@japa/runner'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'
import { createS3Driver } from '#services/storage/s3_driver'

const CONFIG = {
  bucket: 'test-bucket',
  endpoint: 'https://fake.r2.cloudflarestorage.com',
  region: 'auto',
  accessKeyId: 'AKIAFAKE',
  secretAccessKey: 'fakesecret',
}

/**
 * A recording stub in place of a real `S3Client` — asserts *what command was
 * sent* (bucket/key/body) without making a network call. `getPresignedGetUrl`
 * is tested separately below against a real (but offline) `S3Client`, since
 * presigning is pure request-signing, not a network call.
 */
function stubClient(respond: (commandName: string, input: Record<string, unknown>) => unknown) {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = []
  const client = {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      calls.push({ name: command.constructor.name, input: command.input })
      return respond(command.constructor.name, command.input)
    },
  }
  return { client: client as unknown as S3Client, calls }
}

test.group('storage | s3 driver', (group) => {
  let root: string
  group.each.setup(async () => {
    root = await mkdtemp(join(tmpdir(), 'driftless-storage-s3-test-'))
    return () => rm(root, { recursive: true, force: true })
  })

  test('putFile sends a PutObjectCommand with the bucket, key and content type', async ({
    assert,
  }) => {
    const { client, calls } = stubClient(() => ({}))
    const driver = createS3Driver(CONFIG, client)
    const src = join(root, 'photo.webp')
    await writeFile(src, 'bytes')

    await driver.putFile('media/photo.webp', src, 'image/webp')

    assert.lengthOf(calls, 1)
    assert.equal(calls[0].name, 'PutObjectCommand')
    assert.equal(calls[0].input.Bucket, 'test-bucket')
    assert.equal(calls[0].input.Key, 'media/photo.webp')
    assert.equal(calls[0].input.ContentType, 'image/webp')
  })

  test('readToBuffer sends a GetObjectCommand and returns its bytes', async ({ assert }) => {
    const { client } = stubClient((name) => {
      assert.equal(name, 'GetObjectCommand')
      return { Body: { transformToByteArray: async () => new TextEncoder().encode('hi') } }
    })
    const driver = createS3Driver(CONFIG, client)

    const bytes = await driver.readToBuffer('media/x.txt')
    assert.equal(bytes.toString(), 'hi')
  })

  test('readToBuffer throws when the object has no body', async ({ assert }) => {
    const { client } = stubClient(() => ({}))
    const driver = createS3Driver(CONFIG, client)
    await assert.rejects(() => driver.readToBuffer('missing.txt'))
  })

  test('delete sends a DeleteObjectCommand for the key', async ({ assert }) => {
    const { client, calls } = stubClient(() => ({}))
    const driver = createS3Driver(CONFIG, client)

    await driver.delete('ecommerce/abc.pdf')

    assert.equal(calls[0].name, 'DeleteObjectCommand')
    assert.equal(calls[0].input.Key, 'ecommerce/abc.pdf')
  })

  test('exists is true when HeadObjectCommand succeeds, false when it throws', async ({
    assert,
  }) => {
    const ok = stubClient(() => ({}))
    assert.isTrue(await createS3Driver(CONFIG, ok.client).exists('there.txt'))

    const client404 = {
      send: async () => {
        throw new Error('NotFound')
      },
    } as unknown as S3Client
    assert.isFalse(await createS3Driver(CONFIG, client404).exists('nope.txt'))
  })

  test('getPresignedGetUrl signs a real, working URL for the bucket/key', async ({ assert }) => {
    // A real S3Client, but offline: presigning is pure request-signing against
    // the configured credentials/region/endpoint, no network call is made.
    const real = new S3Client({
      region: CONFIG.region,
      endpoint: CONFIG.endpoint,
      credentials: { accessKeyId: CONFIG.accessKeyId, secretAccessKey: CONFIG.secretAccessKey },
    })
    const driver = createS3Driver(CONFIG, real)

    const url = await driver.getPresignedGetUrl('ecommerce/report.pdf', 600)

    assert.include(url, 'fake.r2.cloudflarestorage.com')
    assert.include(url, 'test-bucket')
    assert.include(url, 'ecommerce/report.pdf')
    assert.include(url, 'X-Amz-Expires=600')
  })
})

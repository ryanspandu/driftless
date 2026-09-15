import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageDriver } from './types.js'

export interface S3DriverConfig {
  bucket: string
  endpoint?: string
  region?: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle?: boolean
}

/**
 * S3-API driver — Cloudflare R2, AWS S3, or any other S3-compatible bucket.
 *
 * `client` is injectable so tests can assert on command construction with a
 * stub instead of hitting a real bucket (see `s3_driver.spec.ts`); production
 * callers omit it and get a real `S3Client` built from `config`.
 */
export function createS3Driver(config: S3DriverConfig, client?: S3Client): StorageDriver {
  const s3 =
    client ??
    new S3Client({
      region: config.region || 'auto',
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  const bucket = config.bucket

  async function readToBuffer(key: string): Promise<Buffer> {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const bytes = await res.Body?.transformToByteArray()
    if (!bytes) throw new Error(`storage key not found: "${key}"`)
    return Buffer.from(bytes)
  }

  return {
    async putFile(key, localPath, contentType) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: createReadStream(localPath),
          ContentType: contentType,
        })
      )
    },

    readToBuffer,

    async readToFile(key, destPath) {
      const bytes = await readToBuffer(key)
      await mkdir(dirname(destPath), { recursive: true })
      await writeFile(destPath, bytes)
    },

    async delete(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },

    async exists(key) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return true
      } catch {
        return false
      }
    },

    async getPresignedGetUrl(key, expiresInSeconds) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key })
      return getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
    },
  }
}

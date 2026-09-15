import env from '#start/env'
import { createS3Driver } from './s3_driver.js'
import type { StorageDriver } from './types.js'

export type { StorageDriver } from './types.js'

/** Whether the deployment has opted into S3-backed storage over local disk. */
export function isS3(): boolean {
  return env.get('STORAGE_DRIVER', 'local') === 's3'
}

let cached: StorageDriver | null = null

/**
 * The active S3 driver, built once from env and reused.
 *
 * Only call this when {@link isS3} is true — `local` mode has no driver of
 * its own (see `local_driver.ts`'s docstring for why): callers keep using
 * their existing `fs`/`sharp` code directly in that branch.
 */
export function getStorageDriver(): StorageDriver {
  if (cached) return cached

  const bucket = env.get('S3_BUCKET')
  const accessKeyId = env.get('S3_ACCESS_KEY_ID')
  const secretAccessKey = env.get('S3_SECRET_ACCESS_KEY')
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'STORAGE_DRIVER=s3 needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY set'
    )
  }

  cached = createS3Driver({
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint: env.get('S3_ENDPOINT'),
    region: env.get('S3_REGION', 'auto'),
    forcePathStyle: env.get('S3_FORCE_PATH_STYLE', '') === 'true',
  })
  return cached
}

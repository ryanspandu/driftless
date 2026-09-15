import { copyFile, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative } from 'node:path'
import type { StorageDriver } from './types.js'

/**
 * `fs`-backed driver, rooted at `root`.
 *
 * Not wired into `MediaService`/`DigitalDeliveryService`'s `local`-mode call
 * sites — those keep their own existing `fs`/`sharp` code untouched, so
 * `STORAGE_DRIVER=local` (the default) is provably identical to the
 * pre-storage-driver behaviour. This exists for the `s3` driver's unit tests
 * to have a same-interface counterpart to compare against, and as the
 * straightforward implementation if a call site is ever migrated onto the
 * driver interface directly.
 */
export function createLocalDriver(root: string): StorageDriver {
  function resolve(key: string): string {
    const full = join(root, key)
    const rel = relative(root, full)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`storage key escapes its root: "${key}"`)
    }
    return full
  }

  return {
    async putFile(key, localPath) {
      const dest = resolve(key)
      await mkdir(dirname(dest), { recursive: true })
      await copyFile(localPath, dest)
    },

    async readToBuffer(key) {
      return readFile(resolve(key))
    },

    async readToFile(key, destPath) {
      await mkdir(dirname(destPath), { recursive: true })
      await copyFile(resolve(key), destPath)
    },

    async delete(key) {
      await rm(resolve(key), { force: true })
    },

    async exists(key) {
      try {
        await stat(resolve(key))
        return true
      } catch {
        return false
      }
    },

    async getPresignedGetUrl() {
      // Nothing to sign — a local driver has no separate origin to grant
      // time-limited access to. Callers needing this (digital downloads) must
      // check `isS3()` before relying on it.
      throw new Error('getPresignedGetUrl is not supported by the local storage driver')
    },
  }
}

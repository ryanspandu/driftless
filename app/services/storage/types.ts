/**
 * A backend for the bytes behind media uploads and digital downloads.
 *
 * Deliberately narrow — just what `MediaService` and `DigitalDeliveryService`
 * actually need, not a general-purpose filesystem abstraction. `key` is a
 * bare relative identifier (a filename or `<subdir>/<filename>`), never an
 * absolute path — the same shape callers already validate before use.
 */
export interface StorageDriver {
  /** Upload the bytes at `localPath` to `key`. */
  putFile(key: string, localPath: string, contentType?: string): Promise<void>
  /** Read `key`'s bytes into memory. */
  readToBuffer(key: string): Promise<Buffer>
  /** Read `key`'s bytes to a local file at `destPath`. */
  readToFile(key: string, destPath: string): Promise<void>
  /** Remove `key`. A missing key is not an error. */
  delete(key: string): Promise<void>
  /** Whether `key` exists. */
  exists(key: string): Promise<boolean>
  /** A short-lived, unauthenticated URL that resolves directly to `key`. */
  getPresignedGetUrl(key: string, expiresInSeconds: number): Promise<string>
}

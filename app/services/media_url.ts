import env from '#start/env'

/**
 * Where media URLs live.
 *
 * Its own module rather than a method on `MediaService` because three places
 * need it and only one of them wants the service: the service stamps it onto
 * each row, `start/routes.ts` registers the route that serves it, and the
 * builder's catch-all has to reserve it. Importing the whole service (and the
 * Lucid model behind it) into route registration just to read one string is a
 * heavier dependency than the question deserves.
 *
 * Defaults to `/uploads`, which is what rows written before `MEDIA_URL_PREFIX`
 * was honoured already carry.
 */
export function mediaUrlPrefix(): string {
  const configured = (env.get('MEDIA_URL_PREFIX') ?? '/uploads').trim()
  const withSlash = configured.startsWith('/') ? configured : `/${configured}`
  return withSlash.replace(/\/+$/, '') || '/uploads'
}

/** First path segment of the prefix, for reserved-route checks (`/media` → `media`). */
export function mediaUrlSegment(): string {
  return mediaUrlPrefix().split('/').filter(Boolean)[0] ?? 'uploads'
}

/**
 * Public base URL of the media bucket, or null when media must keep streaming through the app.
 * Only meaningful in `s3` mode; a value that is not an http(s) URL is ignored rather than
 * trusted, since it becomes a redirect target.
 */
export function mediaPublicBaseUrl(): string | null {
  if (env.get('STORAGE_DRIVER', 'local') !== 's3') return null
  const raw = (env.get('S3_PUBLIC_URL') ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^/\s]+/i.test(raw) ? raw : null
}

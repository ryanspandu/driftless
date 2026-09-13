/**
 * Pure mime-type helpers, split out of `media-field.tsx` on purpose: that file
 * pulls in Dialog/Button/query-hook machinery and is lazy-loaded everywhere it's
 * used as a Puck field (see `config.tsx`'s `lazy(() => import('~/puck/media-field'))`).
 * A static top-level import of just these two one-line functions must not drag
 * that whole chunk into the main bundle — so they live here, with zero heavy
 * imports, and `media-field.tsx` re-exports them for its own callers.
 */
export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

export function isVideoMime(mime: string): boolean {
  return mime.startsWith('video/')
}

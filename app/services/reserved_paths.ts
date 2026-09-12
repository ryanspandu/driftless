import { allReservedSegments } from '#modules/registry'
import { mediaUrlSegment } from '#services/media_url'

/**
 * Route prefixes that must never be treated as a builder/CODE page path.
 *
 * Core's own, plus whatever the installed modules claim — a module registers
 * its routes before the CMS catch-all, so a page authored at `/shop/...` would
 * be permanently shadowed rather than merely wrong. Modules contribute through
 * `reservedSegments` so this list never has to name one.
 *
 * Single source of truth for two call sites that must never drift apart:
 *  - `pages_public_controller.ts`'s catch-all — 404s a reserved path outright
 *    rather than looking up a page for it (it never would find a live one, but
 *    would still spend a query on it).
 *  - `pages_service.ts`'s `create`/`update` — REJECTS a page saved at a
 *    reserved path outright, instead of the old silent trap: the page saved
 *    fine but could never render there, with zero feedback.
 */
const RESERVED_FIRST_SEGMENT = new Set([
  ...allReservedSegments(),
  'api',
  'admin',
  'auth',
  'login',
  'register',
  'logout',
  'forgot-password',
  'reset-password',
  'offline',
  'health',
  'assets',
  'build',
  /**
   * Media, at both the configured prefix and the legacy one. A missing file has
   * to 404 as a missing *file* — falling through to here makes it a missing
   * page instead, which is how a broken image ends up reported as a routing bug.
   */
  mediaUrlSegment(),
  'uploads',
  'sw.js',
  'robots.txt',
  'sitemap.xml',
  'favicon.ico',
  /** Shareable draft-preview links (`/preview/:token`). */
  'preview',
  /** Affiliate referral links (`/ref/:code`), registered by the same module. */
  'ref',
])

/** The reserved segment a path's first component matches, or null if it's free. */
export function reservedFirstSegment(path: string): string | null {
  const first = path.split('/')[0]
  return RESERVED_FIRST_SEGMENT.has(first) ? first : null
}

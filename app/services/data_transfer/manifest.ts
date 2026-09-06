import type { IdMode } from './registry.js'

/**
 * The archive envelope. Follows the `_type`/`version` convention the existing
 * single-page bundle uses (`PagesService.importPage` rejects a wrong `_type`),
 * so a stray tar or a future incompatible format is refused up front.
 */

export const ARCHIVE_TYPE = 'driftless.archive'
export const FORMAT_VERSION = 1

export interface ManifestSection {
  name: string
  owner: string
  count: number
  tables?: string[]
}

export interface Manifest {
  _type: typeof ARCHIVE_TYPE
  formatVersion: number
  generatedAt: string
  /** The Driftless version (`CMS_VERSION`) that produced the archive. */
  appVersion: string
  appName?: string
  idMode: IdMode
  includesMedia: boolean
  sections: ManifestSection[]
}

/** Parse + validate the manifest JSON read from an archive; throws on mismatch. */
export function parseManifest(raw: unknown): Manifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid archive: manifest.json is missing or not an object')
  }
  const m = raw as Record<string, unknown>
  if (m._type !== ARCHIVE_TYPE) {
    throw new Error(
      `Invalid archive: expected _type "${ARCHIVE_TYPE}", got "${String(m._type)}". This is not a Driftless export.`
    )
  }
  if (typeof m.formatVersion !== 'number' || m.formatVersion > FORMAT_VERSION) {
    throw new Error(
      `Unsupported archive format version ${String(m.formatVersion)} (this build understands up to ${FORMAT_VERSION}). Upgrade Driftless to import it.`
    )
  }
  if (!Array.isArray(m.sections)) {
    throw new Error('Invalid archive: manifest.sections is missing')
  }
  return m as unknown as Manifest
}

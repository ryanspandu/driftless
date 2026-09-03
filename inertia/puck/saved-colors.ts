import { createContext } from 'react'

/**
 * A user-named colour variable (Webflow-style saved swatch). Stored site-wide in
 * `web_settings` (`theme.saved_colors`) and emitted on public pages as a CSS
 * custom property `--color-<slug>`; a block that picks it stores the live
 * reference `var(--color-<slug>)`, so re-editing the saved colour updates every
 * block that uses it. `value` is the concrete colour, kept for swatch display.
 */
export type SavedColor = { slug: string; name: string; value: string }

/** The site's saved colours, provided by `BuilderShell` down to every `ColorControl`. */
export const SavedColorsContext = createContext<SavedColor[]>([])

/** The `var(--color-<slug>)` reference a block stores when it picks a saved colour. */
export function savedColorRef(slug: string): string {
  return `var(--color-${slug})`
}

/**
 * Parse the stored `theme.saved_colors` JSON (a string or array) into a clean
 * `SavedColor[]` for the client — same slug/value shape the server enforces at
 * read time (the server stays the security boundary; this is just for display).
 */
export function parseSavedColors(raw: unknown): SavedColor[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return []
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: SavedColor[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const slug = typeof o.slug === 'string' ? o.slug.trim().toLowerCase() : ''
    if (!/^[a-z0-9-]{1,40}$/.test(slug) || seen.has(slug)) continue
    const value = typeof o.value === 'string' ? o.value.trim() : ''
    if (!value) continue
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : slug
    seen.add(slug)
    out.push({ slug, name, value })
  }
  return out
}

/** Derive a URL-safe slug for `--color-<slug>` from a display name. */
export function slugifyColorName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

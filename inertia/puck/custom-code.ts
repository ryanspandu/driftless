/**
 * Per-page custom code model, shared by the builder Settings dialog (edit) and the
 * renderers (`config.tsx` root → CSS, `public-page-view.tsx` → JS).
 *
 * Snippets live on the page's Puck `root.props.codeSnippets` so they travel with
 * the page content (no DB migration). The earlier single-string `customCss` /
 * `customJs` props are transparently upgraded to snippets on read, so old pages
 * keep working and get rewritten to the array shape the first time they're edited.
 */

export type CodeLang = 'css' | 'js'

export interface CodeSnippet {
  id: string
  name: string
  lang: CodeLang
  /** Raw CSS / JS source. */
  code: string
  /** Toggle a snippet off without deleting it. */
  enabled: boolean
}

function isSnippet(v: unknown): v is CodeSnippet {
  if (!v || typeof v !== 'object') return false
  const s = v as Record<string, unknown>
  return typeof s.id === 'string' && (s.lang === 'css' || s.lang === 'js') && typeof s.code === 'string'
}

function normalize(v: CodeSnippet): CodeSnippet {
  const s = v as unknown as Record<string, unknown>
  return {
    id: String(s.id),
    name: typeof s.name === 'string' ? s.name : '',
    lang: s.lang === 'css' ? 'css' : 'js',
    code: typeof s.code === 'string' ? s.code : '',
    enabled: s.enabled !== false,
  }
}

/**
 * Read the page's custom-code snippets from Puck root props. Pure (never mutates).
 * Falls back to the legacy `customCss` / `customJs` strings when no `codeSnippets`
 * array is present yet.
 */
export function readSnippets(rootProps: Record<string, unknown> | undefined | null): CodeSnippet[] {
  const p = (rootProps ?? {}) as Record<string, unknown>
  if (Array.isArray(p.codeSnippets)) {
    return p.codeSnippets.filter(isSnippet).map(normalize)
  }
  const out: CodeSnippet[] = []
  if (typeof p.customCss === 'string' && p.customCss.trim()) {
    out.push({ id: 'legacy-css', name: 'Custom CSS', lang: 'css', code: p.customCss, enabled: true })
  }
  if (typeof p.customJs === 'string' && p.customJs.trim()) {
    out.push({ id: 'legacy-js', name: 'Custom JS', lang: 'js', code: p.customJs, enabled: true })
  }
  return out
}

/** Concatenated source of every enabled CSS snippet (for a single `<style>`). */
export function cssFromSnippets(snippets: CodeSnippet[]): string {
  return snippets
    .filter((s) => s.lang === 'css' && s.enabled && s.code.trim())
    .map((s) => s.code)
    .join('\n')
}

/** Enabled JS snippets (each injected as its own `<script>` on the public page). */
export function jsSnippets(snippets: CodeSnippet[]): CodeSnippet[] {
  return snippets.filter((s) => s.lang === 'js' && s.enabled && s.code.trim())
}

let counter = 0
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  counter += 1
  return `snip-${Date.now()}-${counter}`
}

export function newSnippet(lang: CodeLang): CodeSnippet {
  return { id: makeId(), name: lang === 'css' ? 'New CSS' : 'New script', lang, code: '', enabled: true }
}

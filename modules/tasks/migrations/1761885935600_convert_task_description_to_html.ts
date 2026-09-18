import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `Task.description` has always been a plain `text` column, but the admin
 * editor stored a TipTap JSON document inside it as a JSON-stringified
 * string (`serializeDescription`/`parseDescription` in
 * `modules/tasks/ui/admin/index.tsx`) — a client-side workaround for the rich
 * text editor emitting JSON rather than HTML. Now that the task description
 * field uses `ArticleEditor` (HTML in, HTML out, matching `Content.body`),
 * that workaround is removed and this column holds plain HTML directly.
 *
 * Existing rows can hold three shapes: a JSON-stringified TipTap doc (starts
 * with `{`), legacy plain text (pre-dates the rich editor entirely), or
 * already-empty. This is a data-only migration — no column/type change —
 * converting the first two into plain `<p>` HTML, best-effort (text
 * preserved, old TipTap formatting is not).
 */
function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { type?: string; text?: string; content?: unknown[] }
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) return n.content.map((c) => extractText(c)).join('')
  return ''
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function toHtml(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('{')) {
    try {
      const doc = JSON.parse(trimmed) as { content?: unknown[] }
      const content = Array.isArray(doc.content) ? doc.content : []
      const html = content
        .map((block) => extractText(block).trim())
        .filter(Boolean)
        .map((text) => `<p>${escapeHtml(text)}</p>`)
        .join('')
      // Not a TipTap doc after all (some legacy text that happens to start
      // with `{`) — fall through to the plain-text branch below.
      if (html) return html
    } catch {
      // Not JSON — fall through to the plain-text branch below.
    }
  }
  return `<p>${escapeHtml(raw)}</p>`
}

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      const rows = await db.from('tasks').select('id', 'description').whereNotNull('description')
      for (const row of rows) {
        const current = typeof row.description === 'string' ? row.description : ''
        const html = toHtml(current)
        if (html !== current) {
          await db
            .from('tasks')
            .where('id', row.id)
            .update({ description: html || null })
        }
      }
    })
  }

  async down() {
    // One-directional: the original JSON-vs-plain-text distinction isn't
    // recoverable once collapsed to HTML, and rolling back to the old
    // double-encoded-JSON scheme isn't meaningful without the removed
    // frontend helpers that produced it. Left as a no-op.
  }
}

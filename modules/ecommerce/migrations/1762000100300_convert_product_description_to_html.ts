import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `Product.description` moves from a TipTap-JSON `jsonb` column to a plain
 * HTML `text` column — the same shape `Content.body` already uses, and the
 * only shape the admin's rich-text editor (`ArticleEditor`) speaks.
 *
 * No `generateHTML`/JSON→HTML bridge exists in this codebase (nothing else
 * needed one), and this field has never been rendered on the storefront, so a
 * full-fidelity conversion isn't worth adding a new TipTap server dependency
 * for one column. This does a **best-effort plain-text extraction** instead:
 * walk each existing doc's text nodes into `<p>` paragraphs, keeping the
 * words and dropping the old formatting (bold, links, images, etc.).
 *
 * The data backfill runs inside `defer()`, not inline — `schema.alterTable`
 * calls are queued and only actually run when the migration executes, so a
 * plain `await` here would run the backfill query before the columns it
 * touches exist. `defer` queues the callback in the same execution order.
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

function jsonToHtml(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  const content = (doc as { content?: unknown[] }).content
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => extractText(block).trim())
    .filter(Boolean)
    .map((text) => `<p>${escapeHtml(text)}</p>`)
    .join('')
}

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('ecommerce_products', (table) => {
      table.text('description_html').nullable()
    })

    this.defer(async (db) => {
      const rows = await db.from('ecommerce_products').select('id', 'description')
      for (const row of rows) {
        const html = jsonToHtml(row.description)
        if (html) {
          await db.from('ecommerce_products').where('id', row.id).update({ description_html: html })
        }
      }
    })

    this.schema.alterTable('ecommerce_products', (table) => {
      table.dropColumn('description')
    })
    this.schema.alterTable('ecommerce_products', (table) => {
      table.renameColumn('description_html', 'description')
    })
  }

  async down() {
    this.schema.alterTable('ecommerce_products', (table) => {
      table.renameColumn('description', 'description_html')
    })
    this.schema.alterTable('ecommerce_products', (table) => {
      table.jsonb('description').nullable()
    })

    // Best-effort HTML text wrapped back into a minimal TipTap doc so the
    // column round-trips through the old editor without crashing on
    // `undefined` — the original rich formatting was already discarded going
    // forward (see the file comment) and isn't recovered here either.
    this.defer(async (db) => {
      const rows = await db.from('ecommerce_products').select('id', 'description_html')
      for (const row of rows) {
        const text = typeof row.description_html === 'string' ? row.description_html : ''
        if (!text) continue
        const doc = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        }
        await db.from('ecommerce_products').where('id', row.id).update({ description: doc })
      }
    })

    this.schema.alterTable('ecommerce_products', (table) => {
      table.dropColumn('description_html')
    })
  }
}

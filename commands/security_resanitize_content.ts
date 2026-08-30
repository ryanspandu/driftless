import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import Content from '#models/content'
import Page from '#models/page'
import Template from '#models/template'
import CmsService from '#services/cms_service'
import PagesService from '#services/pages_service'
import { sanitizePuckDocument, sanitizeRichText } from '#services/html_sanitizer_service'

/** Rewrites legacy executable HTML through the same write boundaries as new content. */
export default class SecurityResanitizeContent extends BaseCommand {
  static commandName = 'security:resanitize-content'
  static description = 'Dry-run or re-sanitize stored rich text and Puck documents'
  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Persist changes and invalidate SSG snapshots' })
  declare apply?: boolean

  async run() {
    let changed = 0
    const save = async (label: string, before: unknown, after: unknown, write: () => Promise<void>) => {
      if (JSON.stringify(before) === JSON.stringify(after)) return
      changed++
      this.logger.info(`${this.apply ? 'sanitize' : 'would sanitize'} ${label}`)
      if (this.apply) await write()
    }

    for (const row of await Content.query()) {
      const body = sanitizeRichText(row.body)
      await save(`content:${row.id}`, row.body, body, async () => {
        row.body = body
        await row.save()
      })
    }
    for (const row of await Page.query()) {
      const content = sanitizePuckDocument(row.content)
      await save(`page:${row.id}`, row.content, content, async () => {
        row.content = content
        row.renderedHtml = null
        row.renderedBuild = null
        await row.save()
      })
    }
    for (const row of await Template.query()) {
      const content = sanitizePuckDocument(row.content)
      await save(`template:${row.id}`, row.content, content, async () => {
        row.content = content
        await row.save()
      })
    }

    const cms = new CmsService()
    for (const collection of await cms.listCollections()) {
      const rich = collection.fields.filter((field) => field.type === 'RICHTEXT')
      if (!rich.length || collection.key === 'user') continue
      for (let page = 1; ; page++) {
        const result = await cms.listRecords(collection.key, { page, pageSize: 100 })
        for (const record of result.items) {
          const data: Record<string, unknown> = {}
          for (const field of rich) data[field.key] = sanitizeRichText(record.data[field.key])
          await save(`cms:${collection.key}:${record.id}`, rich.map((f) => record.data[f.key]), rich.map((f) => data[f.key]), async () => {
            await cms.updateRecord(collection.key, record.id, null, { data })
          })
        }
        if (page >= result.totalPages) break
      }
    }
    if (this.apply) await new PagesService().invalidateAllSnapshots()
    this.logger.success(`${this.apply ? 'Applied' : 'Dry-run'}: ${changed} record(s) changed`)
  }
}

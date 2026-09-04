/**
 * Emit the machine-readable block catalog the MCP builder-API serves.
 *
 * The Adonis runtime cannot import the React Puck config (`inertia/puck/*` pull
 * in the front-end bundle), so we load it exactly the way Inertia SSR does —
 * through a throwaway Vite server's `ssrLoadModule` — walk the component
 * registry, strip the render functions, and write a compact JSON per builder
 * surface (page / collection / email) to `resources/mcp/`.
 *
 * Run it whenever blocks change:  node ace mcp:catalog
 * It is wired into `predev` / `prebuild` so the catalog stays fresh.
 */
import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface RawField {
  type?: string
  label?: string
  options?: Array<{ label?: string; value?: string | number }>
}
interface RawComponent {
  label?: string
  fields?: Record<string, RawField>
}
interface RawConfig {
  categories?: Record<string, { title?: string; components?: string[] }>
  components?: Record<string, RawComponent>
}

const CONTENT_SHAPE =
  'A Puck document is { root: { props: {} }, content: [ Block ] }. ' +
  'A Block is { type: "<block type>", props: { id: "<unique>", ...fields } }. ' +
  'Nest children by putting an array of Blocks in a slot prop (see each block\'s "slots"). ' +
  'Every block also accepts the shared "styleProps". Leave "id" out and the API fills it in. ' +
  'A block\'s "module" names the module that provides it (null = core); a module block only ' +
  'renders while that module is enabled, so prefer core blocks unless the site uses that module.'

export default class McpCatalog extends BaseCommand {
  static commandName = 'mcp:catalog'
  static description = 'Emit the MCP block catalog (page/collection/email) to resources/mcp/'
  static options: CommandOptions = { startApp: false, staysAlive: false }

  async run() {
    const { createServer } = await import('vite')
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
      logLevel: 'error',
      optimizeDeps: { noDiscovery: true },
    })

    try {
      const styleMod = (await vite.ssrLoadModule('~/puck/style-fields')) as {
        styleFields: Record<string, unknown>
      }
      const styleProps = Object.keys(styleMod.styleFields ?? {})

      // Provenance: which module contributed each block (core blocks are absent).
      const moduleMod = (await vite.ssrLoadModule('~/puck/module-blocks')) as {
        moduleBlockOwners: () => Record<string, string>
      }
      const owners = moduleMod.moduleBlockOwners()

      // `puckConfig` is the full builder set (core blocks + compile-time module
      // blocks), matching what the Pages builder actually renders. The
      // collection set is the same minus the two card-incompatible blocks.
      // Runtime-only custom code-blocks (DB-defined) are not part of a static
      // catalog and are documented as build-in-the-UI only.
      const page = (await vite.ssrLoadModule('~/puck/config')) as { puckConfig: RawConfig }
      const collection = (await vite.ssrLoadModule('~/puck/collection-config')) as {
        collectionPuckConfig: RawConfig
      }
      const email = (await vite.ssrLoadModule('~/puck/email-config')) as {
        emailPuckConfig: RawConfig
      }

      const generatedAt = new Date().toISOString()
      const targets: Array<[string, RawConfig]> = [
        ['page', page.puckConfig],
        ['collection', collection.collectionPuckConfig],
        ['email', email.emailPuckConfig],
      ]

      const outDir = this.app.makePath('resources', 'mcp')
      await mkdir(outDir, { recursive: true })

      for (const [target, config] of targets) {
        const catalog = buildCatalog(target, config, styleProps, owners, generatedAt)
        const file = join(outDir, `catalog.${target}.json`)
        await writeFile(file, JSON.stringify(catalog, null, 2) + '\n', 'utf8')
        this.logger.success(
          `emit ${file.replace(this.app.appRoot.pathname, '')} (${catalog.blocks.length} blocks)`
        )
      }
    } finally {
      await vite.close()
    }
  }
}

function buildCatalog(
  target: string,
  config: RawConfig,
  styleProps: string[],
  owners: Record<string, string>,
  generatedAt: string
) {
  const styleSet = new Set(styleProps)
  const categoryOf = new Map<string, string>()
  for (const [catKey, cat] of Object.entries(config.categories ?? {})) {
    for (const name of cat.components ?? []) categoryOf.set(name, cat.title || catKey)
  }

  const blocks = Object.entries(config.components ?? {})
    .map(([type, component]) => {
      const slots: string[] = []
      const fields: Record<string, unknown> = {}
      for (const [name, field] of Object.entries(component.fields ?? {})) {
        if (styleSet.has(name)) continue // shared style prop — captured in styleProps
        if (field?.type === 'slot') {
          slots.push(name)
          continue
        }
        const descriptor: Record<string, unknown> = { type: field?.type ?? 'text' }
        if (field?.label) descriptor.label = field.label
        if (Array.isArray(field?.options) && field.options.length) {
          descriptor.options = field.options.map((o) => ({ label: o.label, value: o.value }))
        }
        fields[name] = descriptor
      }
      return {
        type,
        label: component.label ?? type,
        category: categoryOf.get(type) ?? 'Other',
        // Provenance: the module that contributes this block (null = core). A
        // module block only renders while its module is enabled.
        module: owners[type] ?? null,
        slots,
        fields,
        styleProps,
      }
    })
    .sort((a, b) => a.type.localeCompare(b.type))

  return { target, generatedAt, contentShape: CONTENT_SHAPE, blocks }
}

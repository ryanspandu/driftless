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
  objectFields?: Record<string, RawField>
  arrayFields?: Record<string, RawField>
  defaultItemProps?: Record<string, unknown>
}
interface RawComponent {
  label?: string
  fields?: Record<string, RawField>
  defaultProps?: Record<string, unknown>
}
interface RawConfig {
  categories?: Record<string, { title?: string; components?: string[] }>
  components?: Record<string, RawComponent>
}

const CONTENT_SHAPE =
  'A Puck document is { root: { props: {} }, content: [ Block ] } — only the ROOT uses a ' +
  'top-level "content" array. ' +
  'A Block is { type: "<block type>", props: { id: "<unique>", ...fields } }. ' +
  'Nest children INSIDE props, keyed by the slot name (see each block\'s "slots") — e.g. ' +
  '{ type: "Section", props: { content: [ ...child Blocks ] } }. Do NOT put the children in a ' +
  'top-level "content" on the block (a sibling of props) — that renders EMPTY. ' +
  'Every block also accepts the shared "styleProps" — each is a plain CSS string value ' +
  '(e.g. padding: "16px 24px", bg: "#ffffff", textColor: "#111827", borderRadius: "8px"); ' +
  'object/number shapes are dropped on render. ' +
  'A field with type "object" documents its shape under "objectFields"; a field with type ' +
  '"array" documents each item\'s shape under "arrayFields" (+ "defaultItemProps" as an example). ' +
  'Each block\'s "defaultProps" is a ready-to-use worked example of valid props. ' +
  'Leave "id" out and the API fills it in. ' +
  'A block\'s "module" names the module that provides it (null = core); a module block only ' +
  'renders while that module is enabled — see the catalog\'s "enabledModules" and prefer core ' +
  'blocks unless the site uses that module.'

/**
 * A one-line "when to reach for this" hint, keyed by block type. Merged onto the
 * matching block as `useFor` so the AI picks the purpose-built block for a
 * design section instead of composing it from scratch (or picking a wrong one).
 * Only blocks worth steering toward are listed; any type absent here just has no
 * hint. Types that only exist when a module is enabled (ProductList, …) are
 * still safe to list — they simply won't match if the block isn't present.
 */
const BLOCK_HINTS: Record<string, string> = {
  Section:
    'A full-width page band. Wrap EVERY page section in a Section (set its bg/padding here), then a Container inside it.',
  Container: 'Centres a section’s content at a max width. Put the section’s blocks inside it.',
  Grid: 'Equal-width columns laid out side by side. Use for feature / stat / logo / card rows — set "columns" (2–4); children become grid items automatically.',
  Columns:
    'Equal-width columns (2–4) — like Grid but without a rows control. It does NOT do uneven widths; for an asymmetric split (copy beside an image, 60/40) use an HFlex whose children carry different `width` styleProps.',
  HFlex:
    'A horizontal row that wraps. Use for a button group / inline items, OR an asymmetric split — give each child its own `width` styleProp (e.g. "60%" / "40%"); flex children honour width, equal grid tracks do not.',
  VFlex:
    'A vertical stack with a consistent gap. Use it (not QuickStack) when you want things stacked on every screen.',
  QuickStack:
    'A grid of equal-width cells; set "columns". Note: it does NOT auto-stack on mobile — for a plain vertical stack use VFlex.',
  Heading: 'A section title (h1–h6). One per section.',
  Paragraph: 'Body copy — sub-headings, descriptions, supporting text.',
  Button:
    'A call-to-action link. Group a primary + secondary CTA inside an HFlex to place them side by side.',
  Image:
    'A single image. Use a REAL asset URL from upload_media — random placeholders look off-brand.',
  Slider: 'A full-bleed rotating hero (one slide at a time). Use for a hero banner carousel.',
  Carousel: 'A multi-per-view sliding track. Use for logo strips or a row of scrolling cards.',
  Reviews:
    'Testimonials as rating cards (author, rating, text, avatar). Use for a "what customers say" section — do NOT hand-build testimonial cards.',
  Accordion: 'An expandable question/answer list. Use for any FAQ or "common questions" section.',
  Tabs: 'Tabbed content panels for switching between related bodies of content.',
  CollectionList:
    'Lists PUBLISHED records of a CMS collection you created (blogs, articles, generic content). Leave template:"builtin" (the default) to get a ready-made card — set cardStyle ("card"|"plain"|"overlay"), columns and imageAspect; the record\'s image field can be a MEDIA field (a media id, resolved to its URL) or a TEXT field holding an image URL. Only set template:"template" if you have created a COLLECTION template to repeat. Do NOT use this for e-commerce products — use ProductList.',
  // Commerce module blocks:
  ProductList:
    'THE correct block for a product/shop grid — renders real product CARDS (image, title, price, columns, sorting) from the store. CREATE the products it shows with the create_product tool (they must be status:"active" to appear) — an empty store renders an empty grid. Do NOT fake products with a CMS collection + CollectionList.',
  ProductDetail:
    'A single product’s full detail (gallery, price, add-to-cart). Use on a product template page.',
  CartBlock: 'The shopping-cart page contents.',
  CheckoutBlock: 'The checkout flow. Use on the checkout page.',
}

/** Hard do/don’t rules, served to every target (layout rules apply everywhere). */
const GUIDANCE_RULES: string[] = [
  'Read this whole catalog first. Every block’s "defaultProps" is a valid, ready-to-use example — copy one and adapt it rather than guessing prop shapes.',
  'Structure every section as Section (full-width band; set bg + padding here) → Container (centres content) → the section’s blocks. Do not place bare content blocks at the page root.',
  'To put items SIDE BY SIDE, wrap them in a layout block — Grid or Columns for EQUAL-width columns, HFlex for a button/inline row OR an asymmetric split (give each child a `width` styleProp; flex honours it, equal grid tracks do not). Sibling blocks with no layout parent stack vertically.',
  'Prefer the purpose-built block over composing from scratch: Reviews for testimonials, Accordion for FAQ, Slider/Carousel for hero or rotating strips, ProductList for products.',
  'For a products / shop section use the commerce ProductList block (real cards with price + image), and CREATE the products it shows with the create_product tool — inline `price` (minor units, e.g. 4900 = $49.00) auto-creates a sellable "Default" variant; set status:"active" so they appear. Do NOT fake products with a CMS collection + CollectionList — that yields plain title/excerpt cards. ProductList and the product tools need the "ecommerce" module: confirm it is listed in this catalog’s "enabledModules" first; if absent, ask the operator to enable it rather than faking it.',
  'Use real images: upload_media returns an asset `url` — use that exact string verbatim (an Image block’s `src`, or a product image’s `mediaUrl`). Avoid random stock/placeholder URLs — they read as off-brand and rarely match the design.',
  'Nest children INSIDE props, keyed by the slot name (see each block’s "slots") — never in a top-level "content" on a child block; only the document root uses a top-level content array.',
]

/** Per-section compositions — the bridge from "here are blocks" to "here is a page". Page target only. */
const GUIDANCE_RECIPES: Array<{ section: string; blocks: string[]; note: string }> = [
  {
    section: 'Hero',
    blocks: ['Section', 'Container', 'Heading', 'Paragraph', 'HFlex(Button, Button)'],
    note: 'Big title + sub-copy + a primary/secondary CTA row (HFlex). Add a Slider or Image alongside for a visual.',
  },
  {
    section: 'Trust bar / logos / stats',
    blocks: ['Section', 'Container', 'Grid(columns:4)', 'Image or Text ×N'],
    note: 'A single Grid with 3–4 columns holding logos or short stat blocks.',
  },
  {
    section: 'Feature grid / how it works',
    blocks: ['Section', 'Container', 'Grid(columns:3)', 'per cell: Heading + Paragraph'],
    note: 'One Grid; each cell is a small stack of a heading and a line of copy (optionally an Image/icon).',
  },
  {
    section: 'Product grid',
    blocks: [
      'create_product ×N (status:"active")',
      'Section',
      'Container',
      'ProductList(columns:3)',
    ],
    note: 'Create the products FIRST with create_product (status:"active", inline `price`); then ProductList renders the cards itself — an empty store shows an empty grid. Do NOT wrap products in a manual Grid of Images.',
  },
  {
    section: 'Testimonials',
    blocks: ['Section', 'Container', 'Reviews(columns:3)'],
    note: 'Reviews renders the rating cards; fill its "reviews" array.',
  },
  {
    section: 'FAQ',
    blocks: ['Section', 'Container', 'Accordion'],
    note: 'Accordion with an "items" array of {question, answer}.',
  },
  {
    section: 'CTA band',
    blocks: ['Section(bg)', 'Container', 'Heading', 'Button'],
    note: 'A coloured Section band with a heading and one CTA button.',
  },
  {
    section: 'Gallery',
    blocks: ['Section', 'Container', 'Grid or Carousel', 'Image ×N'],
    note: 'Grid for a static gallery, Carousel for a scrolling one.',
  },
]

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

      // `puckConfig` is the full builder set (core blocks + compile-time module
      // blocks), matching what the Pages builder actually renders. `baseConfig`
      // is core-only — its names let us exclude core blocks from module
      // provenance. The collection set is the same minus the two card-incompatible
      // blocks. Runtime-only custom code-blocks (DB-defined) are not part of a
      // static catalog and are documented as build-in-the-UI only.
      const page = (await vite.ssrLoadModule('~/puck/config')) as {
        puckConfig: RawConfig
        baseConfig?: RawConfig
      }

      // Provenance: which module contributed each block (core blocks are absent).
      const moduleMod = (await vite.ssrLoadModule('~/puck/module-blocks')) as {
        moduleBlockOwners: (coreComponents?: Iterable<string>) => Record<string, string>
      }
      const owners = moduleMod.moduleBlockOwners(Object.keys(page.baseConfig?.components ?? {}))
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
        fields[name] = describeField(field)
      }
      // The block's own defaultProps are the single most useful signal for the
      // AI — a ready-made valid example. Drop the framework-managed id.
      const defaultProps = { ...(component.defaultProps ?? {}) }
      delete (defaultProps as Record<string, unknown>).id
      return {
        type,
        label: component.label ?? type,
        category: categoryOf.get(type) ?? 'Other',
        // Provenance: the module that contributes this block (null = core). A
        // module block only renders while its module is enabled.
        module: owners[type] ?? null,
        slots,
        fields,
        defaultProps,
        // A "when to use this" hint for the blocks worth steering toward.
        ...(BLOCK_HINTS[type] ? { useFor: BLOCK_HINTS[type] } : {}),
        styleProps,
      }
    })
    .sort((a, b) => a.type.localeCompare(b.type))

  // Recipes only make sense for a full page; the layout rules apply everywhere.
  const guidance =
    target === 'page'
      ? { rules: GUIDANCE_RULES, recipes: GUIDANCE_RECIPES }
      : { rules: GUIDANCE_RULES }

  return { target, generatedAt, contentShape: CONTENT_SHAPE, guidance, blocks }
}

/**
 * Describe one Puck field for the catalog, recursively — so object fields expose
 * their `objectFields` and array fields their `arrayFields` (+ a worked
 * `defaultItemProps`). Without this, object/array props (Select options,
 * ProductList source, Tabs, …) were opaque and the AI had to guess their shape.
 */
function describeField(field: RawField): Record<string, unknown> {
  const d: Record<string, unknown> = { type: field?.type ?? 'text' }
  if (field?.label) d.label = field.label
  if (Array.isArray(field?.options) && field.options.length) {
    d.options = field.options.map((o) => ({ label: o.label, value: o.value }))
  }
  if (field?.type === 'object' && field.objectFields) {
    d.objectFields = Object.fromEntries(
      Object.entries(field.objectFields).map(([k, f]) => [k, describeField(f)])
    )
  }
  if (field?.type === 'array' && field.arrayFields) {
    d.arrayFields = Object.fromEntries(
      Object.entries(field.arrayFields).map(([k, f]) => [k, describeField(f)])
    )
    if (field.defaultItemProps) d.defaultItemProps = field.defaultItemProps
  }
  return d
}

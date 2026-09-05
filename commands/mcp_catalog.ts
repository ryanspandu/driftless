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
    'A call-to-action link. variant:"primary"/"secondary" follow the SITE THEME colours (default purple until you set_appearance); "outline" is bordered; "custom" drops the theme colours so you set the exact design colour with the bg + textColor (+ borderRadius/padding) styleProps. Group a primary + secondary CTA inside an HFlex to place them side by side.',
  Image:
    'A single image. `src` is a url string OR { url, width, height, srcset } (prefer the object form from the upload_media/crop_media response). Use a REAL asset — never a random stock/placeholder URL (they are rejected). To reuse a design’s own photo, upload the reference with purpose:"reference" then crop_media it.',
  Slider: 'A full-bleed rotating hero (one slide at a time). Use for a hero banner carousel.',
  Carousel: 'A multi-per-view sliding track. Use for logo strips or a row of scrolling cards.',
  Reviews:
    'Testimonials as rating cards (author, rating, text, avatar). Use for a "what customers say" section — do NOT hand-build testimonial cards. Set layout:"carousel" for a horizontal slider of cards (vs the default "grid").',
  Icon: 'A single icon for trust-bar / feature glyphs. Set "name" to a curated key (see this block\'s field options, e.g. palette, truck, shield-check, leaf) for a monochrome line-icon coloured by the textColor styleProp — OR to an EMOJI (e.g. "🎨", "🧩", "📦", "⏱️") for a full-colour glyph, which is often how a design\'s colourful icons are best matched.',
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
  'BRAND PALETTE FIRST. Before composing any content, look at the design reference and extract its palette — the primary/CTA colour, secondary, page background, text/ink, and any accents — and its typeface(s). Then call set_appearance({ primaryColor, secondaryColor, fontFamily, fontCssUrl, savedColors:[{slug:"bg",name,value},{slug:"ink",…},{slug:"accent",…}] }) with those exact hex values BEFORE building. This matters because Button variant:"primary"/"secondary", every ProductList/product-card CTA, FormButton, and the cart/checkout buttons ALL render the SITE THEME colours — the catalog’s `theme.effective.primary` shows what they look like now (the default is purple #5225e6). If you skip this step every CTA on the page ships that default purple no matter what the design shows. After set_appearance, reference the saved colours in any block as var(--color-<slug>) (or var(--primary)/var(--secondary)) so sections stay consistent and re-themable. For a per-button colour that differs from the theme, set the Button to variant:"custom" and give it bg + textColor (+ borderRadius/padding) styleProps — those override the variant.',
  'TYPOGRAPHY. Match the design’s type. Set the closest Google family with set_appearance({ fontFamily, fontCssUrl:"https://fonts.googleapis.com/css2?family=…" }), or upload the brand font with upload_media and pass fontFaceUrl + fontCustomName (set fontFamily = fontCustomName). Match heading weight/size per block with the fontWeight / textSize / lineHeight styleProps (headings default to 600).',
  'Structure every section as Section (full-width band; set bg + padding here) → Container (centres content) → the section’s blocks. Do not place bare content blocks at the page root.',
  'To put items SIDE BY SIDE, wrap them in a layout block — Grid or Columns for EQUAL-width columns, HFlex for a button/inline row OR an asymmetric split (give each child a `width` styleProp; flex honours it, equal grid tracks do not). Sibling blocks with no layout parent stack vertically.',
  'Prefer the purpose-built block over composing from scratch: Reviews for testimonials, Accordion for FAQ, Slider/Carousel for hero or rotating strips, ProductList for products.',
  'For a products / shop section use the commerce ProductList block (real cards with price + image), and CREATE the products it shows with the create_product tool — inline `price` (minor units, e.g. 4900 = $49.00) auto-creates a sellable "Default" variant; set status:"active" so they appear. Do NOT fake products with a CMS collection + CollectionList — that yields plain title/excerpt cards. ProductList and the product tools need the "ecommerce" module: confirm it is listed in this catalog’s "enabledModules" first; if absent, ask the operator to enable it rather than faking it.',
  'ASSETS ARE REAL PHOTOS, NOT GUESSES. NEVER substitute random stock or placeholder imagery (picsum, loremflickr, unsplash-source, placehold.co, dummyimage, …) for a hero, product, lifestyle or brand image — those hosts are REJECTED by upload_media and flagged by the validator. If the design’s actual assets were not supplied: (a) if you were given a design screenshot/mockup, upload it with upload_media(purpose:"reference") and cut the design’s OWN photos out with crop_media(mediaId, x, y, width, height) — coordinates in the reference’s pixels; (b) otherwise STOP and ask the operator for the image files/URLs; (c) only if told to proceed anyway, use upload_media(url, purpose:"placeholder") for a labelled stand-in and report every placeholder slot in your summary. Once you have an asset, use its returned `url` verbatim (Image `src`, a product image’s `mediaUrl`, or a Section `backgrounds` image layer url).',
  'For an IMMERSIVE hero / CTA band — a full-bleed background image with text ON TOP — do NOT split into text-column + image-column. Instead set the Section’s `backgrounds` prop (works on any block): an array of layers painted front-to-back. e.g. `backgrounds: [ { "type":"linear", "angle":"90", "stops":[{"color":"rgba(0,0,0,0.55)","pos":"0%"},{"color":"rgba(0,0,0,0)","pos":"60%"}] }, { "type":"image", "url":"<upload_media url>", "sizeMode":"cover", "posX":"center", "posY":"center", "repeat":"no-repeat" } ]` — the gradient/overlay layer (or `{ "type":"overlay", "color":"rgba(0,0,0,0.4)" }`) is listed BEFORE the image for text legibility. Give the Section a `minHeight`, keep `bg` as the base colour, and put the overlay content in a Container aligned as the design shows (often lower-left). A floating card that overlaps the section below (a trust bar) is done with a negative top `margin` on that card.',
  'Nest children INSIDE props, keyed by the slot name (see each block’s "slots") — never in a top-level "content" on a child block; only the document root uses a top-level content array.',
]

/** Per-section compositions — the bridge from "here are blocks" to "here is a page". Page target only. */
const GUIDANCE_RECIPES: Array<{ section: string; blocks: string[]; note: string }> = [
  {
    section: 'Brand setup (do this FIRST, before any section)',
    blocks: ['get_appearance', 'set_appearance(primaryColor, secondaryColor, fontFamily, savedColors)'],
    note: 'Extract the design’s palette + typeface and apply them with set_appearance BEFORE composing. primary/secondary drive every CTA and product button; savedColors (bg, ink, accent, surface) become var(--color-<slug>) for use in any block’s bg/textColor/borderColor. Skipping this ships the default purple CTAs — the #1 reason a build looks off-brand.',
  },
  {
    section: 'Asset inventory (do this SECOND)',
    blocks: ['upload_media(purpose:"reference")', 'crop_media ×N', 'list_media'],
    note: 'Before composing, map every image the design shows to a real asset. If you have the design as an image, upload_media(purpose:"reference") once, then crop_media each hero/thumbnail/product photo out of it (pixel coords in the reference). For assets the operator supplied, upload_media them. Any slot you cannot fill with a real asset must be reported — do NOT paper over it with a stock photo.',
  },
  {
    section: 'Hero',
    blocks: [
      'Section',
      'Container',
      'HFlex( VFlex(Heading, Paragraph, HFlex(Button,Button)) , Image )',
    ],
    note: 'TWO SHAPES — pick the one the design shows. (a) Split: HFlex with child widths — a left VFlex (copy + CTA row) and a right Image. (b) Immersive full-bleed: ONE Section with a background image via its `backgrounds` prop (plus a gradient/overlay layer for legibility) and a `minHeight`, the content (optional thumbnail, Heading, Paragraph, HFlex of buttons) overlaid inside a Container aligned where the design puts it (often lower-left). A trust bar overlapping the hero bottom uses a negative top margin. Match the design; do not default to text-left/image-right.',
  },
  {
    section: 'Trust bar / logos / stats',
    blocks: [
      'Section',
      'Container',
      'Grid(columns:4)',
      'per cell: VFlex(Icon + Heading + Paragraph)',
    ],
    note: 'A single Grid with 3–4 columns; each cell a VFlex of an Icon, a short Heading and a line of Paragraph. Set each Icon’s "name" to a curated key and give it a textColor matching the design’s icon/accent colour (e.g. var(--color-accent) or the brand primary) — do not default to emoji. Use Icon for the glyphs; do not skip them.',
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
    note: 'Reviews renders the rating cards; fill its "reviews" array. If the design shows a slider/carousel of testimonials, set the Reviews block layout:"carousel" (do NOT wrap it in a Carousel).',
  },
  {
    section: 'FAQ',
    blocks: ['Section', 'Container', 'Accordion'],
    note: 'Accordion with an "items" array of {question, answer}.',
  },
  {
    section: 'CTA band',
    blocks: ['Section(bg)', 'Container', 'Heading', 'Button'],
    note: 'A coloured Section band with a heading and one CTA button. Set the Section bg to the design’s band colour — usually var(--primary) or a saved colour — and make sure the Button reads against it (variant:"primary", or variant:"custom" with bg+textColor to match the design exactly).',
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

  // `backgrounds` is read by every block (via Box) but is not a declared
  // styleField, so it was invisible in the catalog — advertise it alongside the
  // other shared style props (its layer shape is documented in styleSchemas).
  const stylePropsOut = styleProps.includes('backgrounds') ? styleProps : [...styleProps, 'backgrounds']

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
        // The Image `src` is a custom MediaField — opaque as `{type:'custom'}`.
        // Spell out the value shape so the AI builds it from an upload_media
        // response instead of guessing.
        if (type === 'Image' && name === 'src') {
          fields[name] = {
            type: 'image',
            label: 'Image',
            shape: 'string | { url, width, height, srcset }',
            note: 'Prefer the object form from upload_media/crop_media: { url, width, height, srcset } — srcset = variants.map(v => `${v.url} ${v.width}w`).join(", "). A bare url string also works.',
          }
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
        styleProps: stylePropsOut,
      }
    })
    .sort((a, b) => a.type.localeCompare(b.type))

  // Recipes only make sense for a full page; the layout rules apply everywhere.
  const guidance =
    target === 'page'
      ? { rules: GUIDANCE_RULES, recipes: GUIDANCE_RECIPES }
      : { rules: GUIDANCE_RULES }

  return {
    target,
    generatedAt,
    contentShape: CONTENT_SHAPE,
    guidance,
    blocks,
    styleSchemas: STYLE_SCHEMAS,
  }
}

/**
 * Shapes for the shared style props whose value is more than a plain CSS string,
 * so the AI (and the validator) know their structure. `backgrounds` is the layer
 * stack that powers an immersive hero.
 */
const STYLE_SCHEMAS = {
  backgrounds:
    'An array of layers painted FRONT-to-BACK (list an overlay/gradient BEFORE the image for legibility). Layer shapes: ' +
    '{ type:"image", url:"<upload_media url>", sizeMode:"cover"|"contain", posX:"center", posY:"center", repeat:"no-repeat" } | ' +
    '{ type:"linear", angle:"90", stops:[{ color:"rgba(0,0,0,0.55)", pos:"0%" }, { color:"rgba(0,0,0,0)", pos:"60%" }] } | ' +
    '{ type:"overlay", color:"rgba(0,0,0,0.4)" }. Set on a Section (with minHeight + bg) for a full-bleed hero/CTA band.',
} as const

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

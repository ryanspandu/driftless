import { BuilderRegion } from '~/custom/builder-region'
import { SiteChrome } from '~/custom/site-chrome'
import type { CodePageProps, KitCapability, KitCapabilityContext } from '~/custom/types'
import { Hero } from './components/hero'
import { ContentFieldsDemo, capability as contentFieldsDemoCapability } from './components/content_fields_demo'
import { RecordBoundDemo, capability as recordBoundDemoCapability } from './components/record_bound_demo'
import './style/style.css'

/** The one path in this kit that resolves to the simplified fields editor —
 *  see `resolveCapability` below and `components/content_fields_demo.tsx`. */
const CONTENT_FIELDS_DEMO_PATH = 'content-fields-demo'
/** The one path that resolves to nothing editable at all — see
 *  `resolveCapability` below and `components/record_bound_demo.tsx`. */
const RECORD_BOUND_DEMO_PATH = 'record-bound-demo'

/**
 * Back-compat only: read when a kit has no `resolveCapability` export (see
 * `registry.ts`). This kit DOES export one below, so `resolveCapability`
 * always wins — kept here as a visible reminder of the flag it replaces for
 * the region path.
 */
export const editableRegion = true

/**
 * Which of this kit's Page rows get a real block region, which get the
 * simplified fields editor, and which get neither — resolved per row from its
 * `path`, mirroring this same file's page-picking `if` you'd write for a
 * multi-template kit. Everything BUT the one demo path below keeps this kit's
 * original behaviour (a real `<BuilderRegion/>`, same as the plain
 * `editableRegion = true` flag already gave it).
 */
export function resolveCapability(ctx: KitCapabilityContext): KitCapability {
  if (ctx.path === CONTENT_FIELDS_DEMO_PATH) return contentFieldsDemoCapability
  if (ctx.path === RECORD_BOUND_DEMO_PATH) return recordBoundDemoCapability
  return { kind: 'region' }
}

/**
 * Reference custom-template kit.
 *
 * Copy this whole folder, rename it (the folder name is the id — a page points
 * at it with `component = "kit:<folder>"`), and edit index.tsx. See the README
 * in `inertia/custom/kits/` for the full contract. Adding or renaming a kit
 * needs a front-end rebuild, because the lookup is a build-time glob.
 */
export default function ExampleKit(props: CodePageProps) {
  const { title, path, header, footer } = props
  if (path === CONTENT_FIELDS_DEMO_PATH) return <ContentFieldsDemo {...props} />
  if (path === RECORD_BOUND_DEMO_PATH) return <RecordBoundDemo {...props} />

  return (
    <SiteChrome header={header} footer={footer}>
      <main className="mx-auto max-w-3xl px-6 py-20">
        <Hero title={title} path={path} />

        <div className="mt-8 rounded-xl border border-border p-5 text-sm leading-relaxed text-muted-foreground">
          This page is a{' '}
          <strong className="font-medium text-foreground">custom template kit</strong> — every pixel
          comes from <code className="font-mono">inertia/custom/kits/example/</code>, not the page
          builder. It can use React, Tailwind, and anything in the app&apos;s UI kit.
        </div>

        {/* Everything inside this region is editable in the page builder, so copy
            and imagery can change without a developer or a deploy. */}
        <div className="mt-10">
          <BuilderRegion placeholder="Open this page in the builder to fill this region." />
        </div>
      </main>
    </SiteChrome>
  )
}

import { PageShell } from './page_shell'
import type { CodePageProps, KitCapability } from '~/custom/types'

/**
 * The field schema this sub-template exposes — read by `index.tsx`'s
 * `resolveCapability` for the one path that renders this component. Declaring
 * it here, next to the template it describes, is what keeps the fields and the
 * markup that reads them from drifting apart.
 */
export const capability: KitCapability = {
  kind: 'fields',
  fields: [
    { key: 'headline', label: 'Headline', type: 'text' },
    {
      key: 'intro',
      label: 'Intro',
      type: 'richtext',
      helpText: 'A short paragraph under the headline.',
    },
    { key: 'photo', label: 'Photo', type: 'image' },
    { key: 'showBadge', label: 'Show "New" badge', type: 'toggle' },
  ],
}

/**
 * Demonstrates the SIMPLIFIED "Edit content region" editor: a page whose kit
 * exposes a small, fixed set of fields instead of a real block region — see
 * this folder's `capability` above and `index.tsx`'s `resolveCapability`.
 *
 * There is nothing to compose here with the page builder (no `<BuilderRegion
 * />`), so the admin shows a plain form (headline / intro / photo / toggle)
 * beside a live preview of this exact component, instead of an empty Puck
 * canvas — see docs/ai/code-pages.md#editable-fields-no-region.
 */
export function ContentFieldsDemo({ header, footer, contentFields }: CodePageProps) {
  const headline = (contentFields?.headline as string) || '(no headline set)'
  const intro = (contentFields?.intro as string) || ''
  const photo = contentFields?.photo as string | undefined
  const showBadge = Boolean(contentFields?.showBadge)

  return (
    <PageShell
      header={header}
      footer={footer}
      eyebrow="Custom template · simplified editor"
      title={headline}
    >
      {showBadge ? (
        <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          New
        </span>
      ) : null}
      {intro ? (
        <div
          className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: intro }}
        />
      ) : null}
      {photo ? (
        <img
          src={photo}
          alt=""
          className="mt-8 aspect-video w-full max-w-2xl rounded-xl border border-border object-cover"
        />
      ) : null}
      <div className="mt-10 rounded-xl border border-border p-5 text-sm leading-relaxed text-muted-foreground">
        Open this page's row menu in <strong className="font-medium text-foreground">Pages</strong>{' '}
        and click <strong className="font-medium text-foreground">Edit content region</strong> — it
        opens a plain form for the four fields above (not the block canvas), next to a live preview
        of this component. See <code className="font-mono">components/content_fields_demo.tsx</code>{' '}
        and <code className="font-mono">index.tsx</code>'s <code className="font-mono">resolveCapability</code>{' '}
        in this kit.
      </div>
    </PageShell>
  )
}

import { lazy, Suspense, type ComponentType, type ElementType, type ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import type { Config } from '@measured/puck'
import { cn } from '~/lib/utils'
import { CollectionSourceField, CollectionList } from '~/puck/collection-list'
import { CollectionTemplateField } from '~/puck/collection-template-field'
import { withModuleBlocks } from '~/puck/module-blocks'
import { withCustomBlocks } from '~/puck/custom-blocks'
import { RichTextView } from '~/puck/rich-text-view'
import { styleFields, Box } from '~/puck/style-fields'
import { MediaField } from '~/puck/media-field'
import { normalizeImageValue, buildSrcset } from '~/puck/image-source'
import { useBoundString, useBoundField, FieldOrText, type Binding } from '~/puck/record-binding'
import { LottieAnimationView, SplineSceneView, RiveView } from '~/puck/media-embeds'
import {
  CarouselView,
  DropdownView,
  LightboxView,
  NavbarView,
  ReviewsView,
  SliderView,
  TabsView,
} from '~/puck/blocks-interactive'
import {
  ForgotPasswordFormView,
  FormBlockView,
  LoginFormView,
  RegisterFormView,
  ResetPasswordFormView,
} from '~/puck/blocks-auth'
import { TemplateRefField, TemplateRefView } from '~/puck/template-ref'
import { PageOutletView } from '~/puck/page-outlet'
import { cssFromSnippets, readSnippets } from '~/puck/custom-code'

// TipTap editor is lazy-loaded so it stays out of the SSR render path.
const RichTextField = lazy(() =>
  import('~/puck/rich-text-field').then((m) => ({ default: m.RichTextField }))
)

/** Extract a YouTube video id from a full URL (watch/youtu.be/embed/shorts) or a raw id. */
function parseYouTubeId(input: string): string | null {
  const s = (input || '').trim()
  if (!s) return null
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s
  const m = s.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/
  )
  return m ? m[1] : null
}

/**
 * Puck block registry for the Pages builder.
 *
 * Style-ready by design: every block spreads the shared `styleFields` and wraps
 * its output in `<Box>`, so new style controls (border, shadow, per-breakpoint…)
 * are added in ONE place and inherited everywhere. Block props are plain JSON,
 * so enriching the controls later needs no migration. The shared controls and
 * the `<Box>` renderer live in `~/puck/style-fields`.
 */

function PuckRoot({ children, ...rootProps }: { children?: ReactNode } & Record<string, unknown>) {
  const { cspNonce } = usePage<{ cspNonce?: string }>().props
  const css = cssFromSnippets(readSnippets(rootProps))
  return (
    <div className="theme-light">
      {css ? <style nonce={cspNonce} dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {children}
    </div>
  )
}

// ── Binding-aware views (repeater `{{field}}` tokens work in these) ──────────
// Real components (not inline render arrows) so the record-binding hook is valid.

type StyleBag = Record<string, unknown>
type ButtonViewProps = {
  label?: string
  href?: string
  variant?: string
  binding?: Binding
} & StyleBag

function ButtonView({ label, href, variant, binding, ...s }: ButtonViewProps) {
  // Bound field wins; else the static value (with token support).
  const fieldLabel = useBoundField(binding?.label)
  const fieldHref = useBoundField(binding?.href)
  const staticLabel = useBoundString(label)
  const staticHref = useBoundString(href)
  const boundLabel = fieldLabel == null ? staticLabel : fieldLabel
  const boundHref = fieldHref == null ? staticHref : fieldHref
  return (
    <Box s={s}>
      <a
        href={boundHref || '#'}
        className={cn(
          'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors',
          variant === 'primary' && 'bg-primary text-primary-foreground hover:opacity-90',
          variant === 'secondary' && 'bg-secondary text-secondary-foreground hover:opacity-90',
          variant === 'outline' && 'border border-input hover:bg-accent'
        )}
      >
        {boundLabel}
      </a>
    </Box>
  )
}

type TextLinkViewProps = {
  text?: string
  href?: string
  newTab?: string
  binding?: Binding
} & StyleBag

function TextLinkView({ text, href, newTab, binding, ...s }: TextLinkViewProps) {
  // Bound field wins; else the static href (with `{{token}}` support).
  const fieldHref = useBoundField(binding?.href)
  const staticHref = useBoundString(href ?? '')
  const boundHref = fieldHref == null ? staticHref : fieldHref
  return (
    <Box
      as="a"
      s={s}
      href={boundHref || '#'}
      className="underline underline-offset-2"
      {...(newTab === 'true' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <FieldOrText field={binding?.text}>{text}</FieldOrText>
    </Box>
  )
}

type LinkBlockViewProps = {
  content?: ComponentType
  href?: string
  newTab?: string
  binding?: Binding
} & StyleBag

function LinkBlockView({ content: Content, href, newTab, binding, ...s }: LinkBlockViewProps) {
  const fieldHref = useBoundField(binding?.href)
  const staticHref = useBoundString(href ?? '')
  const boundHref = fieldHref == null ? staticHref : fieldHref
  return (
    <Box
      as="a"
      s={s}
      href={boundHref || '#'}
      {...(newTab === 'true' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {Content ? <Content /> : null}
    </Box>
  )
}

type RichTextViewBlockProps = { html?: string; binding?: Binding } & StyleBag

function RichTextBlockView({ html, binding, ...s }: RichTextViewBlockProps) {
  // A bound RICHTEXT field's value is sanitised HTML; render it per record. The
  // editor placeholder `[html]` is not HTML, so fall back to empty for it.
  const fieldHtml = useBoundField(binding?.html)
  const resolved =
    fieldHtml == null ? (html ?? '') : /^\[[^\]]+\]$/.test(fieldHtml) ? '' : fieldHtml
  return (
    <Box s={s}>
      <RichTextView html={resolved} />
    </Box>
  )
}

type ImageViewProps = {
  src?: unknown
  alt?: string
  sizes?: string
  priority?: string
  binding?: Binding
} & StyleBag

function ImageView({ src, alt, sizes, priority, binding, ...s }: ImageViewProps) {
  const img = normalizeImageValue(src)
  // A bound src comes straight from the record's field; else the static URL
  // (with `{{token}}` support).
  const fieldSrc = useBoundField(binding?.src)
  const staticUrl = useBoundString(img.url)
  // A bound-but-empty field returns the editor placeholder `[fieldKey]`; that is
  // not a URL, so treat it as "no image" (show the empty-state box) instead of
  // rendering a broken <img src="[fieldKey]">.
  const boundUrl = fieldSrc != null && /^\[[^\]]+\]$/.test(fieldSrc) ? '' : fieldSrc
  const url = boundUrl == null ? staticUrl : boundUrl
  const boundAlt = useBoundString(alt)
  // srcset only applies to the picked static image, never a bound field URL.
  const useSrcset = img.srcset && fieldSrc == null && url === img.url
  return (
    <Box s={s}>
      {url ? (
        <img
          src={url}
          alt={boundAlt || ''}
          className="h-auto max-w-full"
          loading={priority === 'true' ? 'eager' : 'lazy'}
          decoding="async"
          {...(useSrcset ? { srcSet: img.srcset } : {})}
          {...(useSrcset && sizes ? { sizes } : useSrcset ? { sizes: '100vw' } : {})}
          {...(img.width ? { width: img.width } : {})}
          {...(img.height ? { height: img.height } : {})}
          {...(priority === 'true' ? { fetchPriority: 'high' as const } : {})}
        />
      ) : (
        <div className="flex h-40 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
          No image URL
        </div>
      )}
    </Box>
  )
}

/**
 * HTML void elements — they take no children. Rendering a slot into one throws
 * a React invariant ("<img> is a void element tag and must not have children")
 * that, because the page is one React tree, blanks the ENTIRE page. The Custom
 * Element block guards against this.
 */
const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

export const baseConfig: Config = {
  root: {
    // Keep the rendered page in the light theme: the canvas previews the public
    // page (always light) even while the editor chrome follows the admin's dark
    // mode. Applies in the editor canvas and on the public/SSR render alike.
    render: PuckRoot,
  },
  // Webflow-style grouping of the Components drawer. Components not listed in any
  // category fall into Puck's default "Other" group. Built up per phase.
  categories: {
    structure: {
      title: 'Structure',
      components: ['Section', 'Container', 'QuickStack', 'VFlex', 'HFlex', 'PageOutlet'],
    },
    basic: {
      title: 'Basic',
      components: ['DivBlock', 'List', 'ListItem', 'LinkBlock', 'Button'],
    },
    typography: {
      title: 'Typography',
      components: ['Heading', 'Paragraph', 'TextLink', 'Text', 'BlockQuote', 'RichText'],
    },
    cms: {
      title: 'CMS',
      components: ['CollectionList'],
    },
    media: {
      title: 'Media',
      components: ['Image', 'Video', 'YouTube', 'LottieAnimation', 'SplineScene', 'Rive'],
    },
    forms: {
      title: 'Forms',
      components: [
        // Turnkey auth forms first: they are the ones that work on their own.
        'LoginForm',
        'RegisterForm',
        'ForgotPasswordForm',
        'ResetPasswordForm',
        'FormBlock',
        'Label',
        'Input',
        'FileUpload',
        'TextArea',
        'Checkbox',
        'RadioButton',
        'Select',
        'Recaptcha',
        'FormButton',
      ],
    },
    advanced: {
      title: 'Advanced',
      // Locales List is skipped (no i18n locales in Driftless).
      components: [
        'Search',
        'BackgroundVideo',
        'Dropdown',
        'CodeEmbed',
        'Lightbox',
        'Navbar',
        'Slider',
        'Carousel',
        'Tabs',
        'Map',
        'Reviews',
        'Facebook',
        'XTwitter',
        'CustomElement',
        'CodeBlock',
      ],
    },
    // Grid + Columns (Webflow's "Other"), plus our remaining utility blocks so
    // nothing falls into Puck's implicit uncategorized bucket.
    other: {
      title: 'Other',
      components: ['Grid', 'Columns', 'Spacer', 'Divider', 'TemplateRef'],
    },
  },
  components: {
    Section: {
      label: 'Section',
      inline: true,
      fields: { content: { type: 'slot' }, ...styleFields },
      defaultProps: { content: [] },
      render: ({ content: Content, ...s }) => (
        <Box as="section" s={s} className="w-full">
          <Content />
        </Box>
      ),
    },

    Container: {
      label: 'Container',
      inline: true,
      fields: { content: { type: 'slot' }, ...styleFields },
      defaultProps: { content: [] },
      render: ({ content: Content, ...s }) => (
        <Box s={s}>
          <Content />
        </Box>
      ),
    },

    Columns: {
      label: 'Columns',
      inline: true,
      fields: {
        count: {
          type: 'select',
          label: 'Columns',
          options: [
            { label: '2', value: '2' },
            { label: '3', value: '3' },
            { label: '4', value: '4' },
          ],
        },
        gap: { type: 'text', label: 'Gap' },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: { count: '2', gap: '24px', content: [] },
      render: ({ content: Content, count, gap, display: _d, ...s }) => (
        <Box
          s={s}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Number(count) || 2}, minmax(0, 1fr))`,
            gap: gap || '24px',
          }}
        >
          <Content style={{ display: 'contents' }} />
        </Box>
      ),
    },

    // Grid — CSS grid with configurable columns + rows (Webflow Grid).
    Grid: {
      label: 'Grid',
      inline: true,
      fields: {
        columns: {
          type: 'select',
          label: 'Columns',
          options: [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), value: String(n) })),
        },
        rows: {
          type: 'select',
          label: 'Rows',
          options: [1, 2, 3, 4].map((n) => ({ label: String(n), value: String(n) })),
        },
        gap: { type: 'text', label: 'Gap' },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: { columns: '2', rows: '1', gap: '16px', display: 'grid', content: [] },
      // The grid lives on the Box; the slot wrapper is made `display:contents` so
      // the cards become DIRECT grid items of the Box (otherwise the DropZone
      // wrapper is the grid's only item and everything stacks). Forcing display on
      // the Box also makes it work without the `display` prop (API/MCP-composed).
      render: ({ content: Content, columns, rows, gap, display: _d, ...s }) => (
        <Box
          s={s}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Number(columns) || 2}, minmax(0, 1fr))`,
            gridTemplateRows:
              Number(rows) > 1 ? `repeat(${Number(rows)}, minmax(0, 1fr))` : undefined,
            gap: gap || '16px',
          }}
        >
          <Content style={{ display: 'contents' }} />
        </Box>
      ),
    },

    // Quick Stack — a responsive grid of cells (Webflow Quick Stack). `columns`
    // sets the column count; children auto-place into the grid.
    QuickStack: {
      label: 'Quick Stack',
      inline: true,
      fields: {
        columns: {
          type: 'select',
          label: 'Columns',
          options: [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), value: String(n) })),
        },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: { columns: '2', display: 'grid', content: [] },
      render: ({ content: Content, columns, gap, display: _d, ...s }) => (
        <Box
          s={s}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Number(columns) || 2}, minmax(0, 1fr))`,
            gap: (typeof gap === 'string' && gap) || '16px',
          }}
        >
          <Content style={{ display: 'contents' }} />
        </Box>
      ),
    },

    // V Flex — vertical flex container (column). Direction/gap are editable in the
    // Detail → Layout panel.
    VFlex: {
      label: 'V Flex',
      inline: true,
      fields: { content: { type: 'slot' }, ...styleFields },
      defaultProps: { display: 'flex', flexDirection: 'column', content: [] },
      // Flex goes on the SLOT (DropZone) so children are direct flex items; the
      // Box stays a plain wrapper. Layout props are pulled from `s` (with sane
      // defaults) so it works even when they're absent (API/MCP-composed block).
      render: ({ content: Content, display: _d, flexDirection: _fd, gap, alignItems, ...s }) => (
        <Box
          s={s}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: typeof gap === 'string' ? gap : undefined,
            alignItems: typeof alignItems === 'string' ? alignItems : undefined,
          }}
        >
          <Content style={{ display: 'contents' }} />
        </Box>
      ),
    },

    // H Flex — horizontal flex container (row).
    HFlex: {
      label: 'H Flex',
      inline: true,
      fields: { content: { type: 'slot' }, ...styleFields },
      defaultProps: { display: 'flex', flexDirection: 'row', content: [] },
      render: ({
        content: Content,
        display: _d,
        flexDirection: _fd,
        gap,
        alignItems,
        justifyContent,
        ...s
      }) => (
        <Box
          s={s}
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: typeof gap === 'string' ? gap : '12px',
            alignItems: typeof alignItems === 'string' ? alignItems : 'center',
            justifyContent: typeof justifyContent === 'string' ? justifyContent : undefined,
          }}
        >
          <Content style={{ display: 'contents' }} />
        </Box>
      ),
    },

    Heading: {
      label: 'Heading',
      fields: {
        text: { type: 'text', label: 'Text' },
        level: {
          type: 'select',
          label: 'Level',
          options: [1, 2, 3, 4, 5, 6].map((n) => ({ label: `H${n}`, value: String(n) })),
        },
        ...styleFields,
      },
      defaultProps: { text: 'Heading', level: '2' },
      render: ({ text, level, binding, ...s }) => (
        <Box as={`h${level || '2'}` as ElementType} s={s} className="font-semibold tracking-tight">
          <FieldOrText field={(binding as Binding | undefined)?.text}>{text}</FieldOrText>
        </Box>
      ),
    },

    // Text Block — generic text element (Webflow "Text Block"). Key stays `Text`
    // for backward compatibility with existing pages.
    Text: {
      label: 'Text Block',
      fields: { text: { type: 'textarea', label: 'Text' }, ...styleFields },
      defaultProps: { text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
      render: ({ text, binding, ...s }) => (
        <Box s={s} style={{ whiteSpace: 'pre-line' }}>
          <FieldOrText field={(binding as Binding | undefined)?.text}>{text}</FieldOrText>
        </Box>
      ),
    },

    // Paragraph — a <p> element.
    Paragraph: {
      label: 'Paragraph',
      fields: { text: { type: 'textarea', label: 'Text' }, ...styleFields },
      defaultProps: { text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
      render: ({ text, binding, ...s }) => (
        <Box as="p" s={s} style={{ whiteSpace: 'pre-line' }}>
          <FieldOrText field={(binding as Binding | undefined)?.text}>{text}</FieldOrText>
        </Box>
      ),
    },

    // Text Link — an inline <a> with text (vs Link Block, which wraps content).
    TextLink: {
      label: 'Text Link',
      fields: {
        text: { type: 'text', label: 'Text' },
        href: { type: 'text', label: 'Link (href)' },
        newTab: {
          type: 'radio',
          label: 'Open in',
          options: [
            { label: 'Same tab', value: 'false' },
            { label: 'New tab', value: 'true' },
          ],
        },
        ...styleFields,
      },
      defaultProps: { text: 'Link text', href: '#', newTab: 'false' },
      render: (props) => <TextLinkView {...(props as TextLinkViewProps)} />,
    },

    // Block Quote — a <blockquote> with the conventional left rule + italic.
    BlockQuote: {
      label: 'Block Quote',
      fields: { text: { type: 'textarea', label: 'Quote' }, ...styleFields },
      defaultProps: { text: 'Block quote — a notable quotation from the page content.' },
      render: ({ text, binding, ...s }) => (
        <Box
          as="blockquote"
          s={s}
          className="border-l-4 border-border pl-4 italic"
          style={{ whiteSpace: 'pre-line' }}
        >
          <FieldOrText field={(binding as Binding | undefined)?.text}>{text}</FieldOrText>
        </Box>
      ),
    },

    Button: {
      label: 'Button',
      fields: {
        label: { type: 'text', label: 'Label' },
        href: { type: 'text', label: 'Link (href)' },
        variant: {
          type: 'select',
          label: 'Variant',
          options: [
            { label: 'Primary', value: 'primary' },
            { label: 'Secondary', value: 'secondary' },
            { label: 'Outline', value: 'outline' },
          ],
        },
        ...styleFields,
      },
      defaultProps: { label: 'Click me', href: '#', variant: 'primary' },
      render: (props) => <ButtonView {...(props as ButtonViewProps)} />,
    },

    // Div Block — generic container (Webflow's workhorse). Style-ready slot.
    DivBlock: {
      label: 'Div Block',
      inline: true,
      fields: { content: { type: 'slot' }, ...styleFields },
      defaultProps: { content: [] },
      render: ({ content: Content, ...s }) => (
        <Box s={s}>
          <Content />
        </Box>
      ),
    },

    // List — <ul>/<ol>. Markers restored via inherited list-style (Tailwind preflight
    // resets them); fill it with List Item blocks.
    List: {
      label: 'List',
      fields: {
        ordered: {
          type: 'radio',
          label: 'Type',
          options: [
            { label: 'Bulleted', value: 'false' },
            { label: 'Numbered', value: 'true' },
          ],
        },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: { ordered: 'false', content: [] },
      render: ({ content: Content, ordered, ...s }) => (
        <Box
          as={ordered === 'true' ? 'ol' : 'ul'}
          s={s}
          style={{ listStyleType: ordered === 'true' ? 'decimal' : 'disc', paddingLeft: '1.5rem' }}
        >
          <Content />
        </Box>
      ),
    },

    // List Item — <li> container. `display: list-item` so it renders a marker
    // inside a List (inherits the list's marker type).
    ListItem: {
      label: 'List Item',
      fields: { content: { type: 'slot' }, ...styleFields },
      defaultProps: { content: [] },
      render: ({ content: Content, ...s }) => (
        <Box as="li" s={s}>
          <Content />
        </Box>
      ),
    },

    // Link Block — an <a> that wraps arbitrary content (block-level by default).
    LinkBlock: {
      label: 'Link Block',
      fields: {
        href: { type: 'text', label: 'Link (href)' },
        newTab: {
          type: 'radio',
          label: 'Open in',
          options: [
            { label: 'Same tab', value: 'false' },
            { label: 'New tab', value: 'true' },
          ],
        },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: { href: '#', newTab: 'false', display: 'block', content: [] },
      render: (props) => <LinkBlockView {...(props as LinkBlockViewProps)} />,
    },

    Image: {
      label: 'Image',
      fields: {
        src: {
          type: 'custom',
          label: 'Image',
          render: ({ value, onChange }) => {
            const cur = normalizeImageValue(value)
            return (
              <MediaField
                value={cur.url}
                // A pasted / cleared URL carries no variants → plain object.
                onChange={(url) => onChange((url ? { url } : '') as never)}
                // A library pick captures dimensions + responsive srcset.
                onPick={(item) =>
                  onChange({
                    url: item.url,
                    width: item.width,
                    height: item.height,
                    srcset: buildSrcset(item.variants),
                  } as never)
                }
              />
            )
          },
        },
        alt: { type: 'text', label: 'Alt text' },
        sizes: {
          type: 'text',
          label: 'Sizes (advanced, e.g. "(max-width: 768px) 100vw, 50vw")',
        },
        priority: {
          type: 'radio',
          label: 'Above the fold',
          options: [
            { label: 'No (lazy-load)', value: 'false' },
            { label: 'Yes (load eagerly)', value: 'true' },
          ],
        },
        ...styleFields,
      },
      defaultProps: { src: '', alt: '', sizes: '', priority: 'false' },
      render: (props) => <ImageView {...(props as ImageViewProps)} />,
    },

    // Video — native <video> from a file URL (.mp4/.webm).
    Video: {
      label: 'Video',
      fields: {
        src: { type: 'text', label: 'Video URL (.mp4 / .webm)' },
        poster: { type: 'text', label: 'Poster image URL' },
        autoplay: {
          type: 'radio',
          label: 'Autoplay',
          options: [
            { label: 'No', value: 'false' },
            { label: 'Yes (muted)', value: 'true' },
          ],
        },
        loop: {
          type: 'radio',
          label: 'Loop',
          options: [
            { label: 'No', value: 'false' },
            { label: 'Yes', value: 'true' },
          ],
        },
        controls: {
          type: 'radio',
          label: 'Controls',
          options: [
            { label: 'Show', value: 'true' },
            { label: 'Hide', value: 'false' },
          ],
        },
        ...styleFields,
      },
      defaultProps: { src: '', poster: '', autoplay: 'false', loop: 'false', controls: 'true' },
      render: ({ src, poster, autoplay, loop, controls, ...s }) => (
        <Box s={s}>
          {src ? (
            <video
              src={src}
              poster={poster || undefined}
              controls={controls !== 'false'}
              autoPlay={autoplay === 'true'}
              loop={loop === 'true'}
              muted={autoplay === 'true'}
              playsInline
              className="h-auto w-full"
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
              Add a video URL
            </div>
          )}
        </Box>
      ),
    },

    // YouTube — responsive 16:9 embed; accepts any YouTube URL or a raw video id.
    YouTube: {
      label: 'YouTube',
      fields: {
        url: { type: 'text', label: 'YouTube URL or video ID' },
        ...styleFields,
      },
      defaultProps: { url: '' },
      render: ({ url, ...s }) => {
        const id = parseYouTubeId(url)
        return (
          <Box s={s}>
            {id ? (
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                <iframe
                  src={`https://www.youtube.com/embed/${id}`}
                  title="YouTube video"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    border: 0,
                  }}
                />
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
                Paste a YouTube URL
              </div>
            )}
          </Box>
        )
      },
    },

    // Lottie — vector animation from a .json/.lottie URL (lazy, client-only).
    LottieAnimation: {
      label: 'Lottie Animation',
      fields: {
        src: { type: 'text', label: 'Lottie URL (.json / .lottie)' },
        loop: {
          type: 'radio',
          label: 'Loop',
          options: [
            { label: 'Yes', value: 'true' },
            { label: 'No', value: 'false' },
          ],
        },
        autoplay: {
          type: 'radio',
          label: 'Autoplay',
          options: [
            { label: 'Yes', value: 'true' },
            { label: 'No', value: 'false' },
          ],
        },
        ...styleFields,
      },
      defaultProps: { src: '', loop: 'true', autoplay: 'true' },
      render: ({ src, loop, autoplay, ...s }) => (
        <Box s={s}>
          <LottieAnimationView src={src} loop={loop !== 'false'} autoplay={autoplay !== 'false'} />
        </Box>
      ),
    },

    // Spline — interactive 3D scene from a .splinecode URL (lazy, client-only).
    SplineScene: {
      label: 'Spline Scene',
      fields: { scene: { type: 'text', label: 'Spline URL (.splinecode)' }, ...styleFields },
      defaultProps: { scene: '' },
      render: ({ scene, ...s }) => (
        <Box s={s}>
          <SplineSceneView scene={scene} />
        </Box>
      ),
    },

    // Rive — interactive animation from a .riv URL (lazy, client-only).
    Rive: {
      label: 'Rive',
      fields: { src: { type: 'text', label: 'Rive URL (.riv)' }, ...styleFields },
      defaultProps: { src: '' },
      render: ({ src, ...s }) => (
        <Box s={s}>
          <RiveView src={src} />
        </Box>
      ),
    },

    RichText: {
      label: 'Rich text',
      fields: {
        html: {
          type: 'custom',
          label: 'Content',
          render: ({ value, onChange }) => (
            <Suspense
              fallback={<div className="text-sm text-muted-foreground">Loading editor…</div>}
            >
              <RichTextField value={value} onChange={onChange} />
            </Suspense>
          ),
        },
        ...styleFields,
      },
      defaultProps: { html: '<p>Write rich text here…</p>' },
      render: (props) => <RichTextBlockView {...(props as RichTextViewBlockProps)} />,
    },

    CollectionList: {
      label: 'Collection List',
      fields: {
        source: {
          type: 'custom',
          label: 'Collection',
          render: ({ value, onChange }) => (
            <CollectionSourceField value={value} onChange={onChange} />
          ),
        },
        // 'card' (the old built-in preset) is no longer offered but pages saved
        // with it still render through the legacy path in CollectionList.
        template: {
          type: 'radio',
          label: 'Item design',
          options: [
            { label: 'Select template', value: 'template' },
            { label: 'Custom (design below)', value: 'custom' },
          ],
        },
        // A COLLECTION template (Templates area) repeated once per record. Only
        // used when Item design = Select template; the field hides itself otherwise.
        templateId: {
          type: 'custom',
          label: 'Template',
          render: ({ value, onChange }) => (
            <CollectionTemplateField value={value} onChange={onChange} />
          ),
        },
        // The designed item, repeated once per record. Only used when Item
        // design = Custom; bind child elements to fields via their Settings tab.
        item: { type: 'slot' },
        // Optional "no records" design; falls back to a default notice.
        empty: { type: 'slot' },
        layout: {
          type: 'select',
          label: 'Layout',
          options: [
            { label: 'Grid of cards', value: 'grid' },
            { label: 'Vertical list', value: 'list' },
          ],
        },
        cardStyle: {
          type: 'select',
          label: 'Item style',
          options: [
            { label: 'Card (bordered)', value: 'card' },
            { label: 'Plain (no border)', value: 'plain' },
            { label: 'Image overlay', value: 'overlay' },
          ],
        },
        columns: {
          type: 'select',
          label: 'Columns (grid)',
          options: [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), value: String(n) })),
        },
        gap: { type: 'number', label: 'Gap (px)' },
        imageAspect: {
          type: 'select',
          label: 'Image aspect',
          options: [
            { label: '16:9', value: 'video' },
            { label: 'Square', value: 'square' },
            { label: 'Portrait 3:4', value: 'portrait' },
            { label: 'Original', value: 'auto' },
          ],
        },
        showImage: {
          type: 'radio',
          label: 'Show image',
          options: [
            { label: 'Yes', value: 'true' },
            { label: 'No', value: 'false' },
          ],
        },
        showTitle: {
          type: 'radio',
          label: 'Show title',
          options: [
            { label: 'Yes', value: 'true' },
            { label: 'No', value: 'false' },
          ],
        },
        showExcerpt: {
          type: 'radio',
          label: 'Show excerpt',
          options: [
            { label: 'Yes', value: 'true' },
            { label: 'No', value: 'false' },
          ],
        },
        sort: {
          type: 'select',
          label: 'Sort by',
          options: [
            { label: 'Newest first', value: 'newest' },
            { label: 'Oldest first', value: 'oldest' },
            { label: 'Title A → Z', value: 'title-asc' },
            { label: 'Title Z → A', value: 'title-desc' },
          ],
        },
        filterField: { type: 'text', label: 'Filter field (key)' },
        filterValue: { type: 'text', label: 'Filter contains' },
        limit: { type: 'number', label: 'Total items to load' },
        pageSize: { type: 'number', label: 'Items per page (0 = all)' },
        ...styleFields,
      },
      defaultProps: {
        source: {},
        template: 'template',
        templateId: '',
        item: [],
        layout: 'grid',
        cardStyle: 'card',
        columns: '3',
        gap: 20,
        imageAspect: 'video',
        showImage: 'true',
        showTitle: 'true',
        showExcerpt: 'true',
        sort: 'newest',
        filterField: '',
        filterValue: '',
        limit: 12,
        pageSize: 0,
        empty: [],
      },
      render: ({
        source,
        template,
        templateId,
        item: Item,
        empty: Empty,
        layout,
        cardStyle,
        columns,
        gap,
        imageAspect,
        showImage,
        showTitle,
        showExcerpt,
        sort,
        filterField,
        filterValue,
        limit,
        pageSize,
        ...s
      }) => (
        <Box s={s}>
          <CollectionList
            source={source}
            template={template}
            templateId={templateId}
            ItemSlot={Item as unknown as ComponentType}
            EmptySlot={Empty as unknown as ComponentType}
            editing={Boolean((s.puck as { isEditing?: boolean } | undefined)?.isEditing)}
            layout={layout}
            cardStyle={cardStyle}
            columns={columns}
            gap={gap}
            imageAspect={imageAspect}
            showImage={showImage}
            showTitle={showTitle}
            showExcerpt={showExcerpt}
            sort={sort}
            filterField={filterField}
            filterValue={filterValue}
            limit={limit}
            pageSize={pageSize}
          />
        </Box>
      ),
    },

    TemplateRef: {
      label: 'Template Reference',
      fields: {
        templateId: {
          type: 'custom',
          label: 'Template',
          render: ({ value, onChange }) => <TemplateRefField value={value} onChange={onChange} />,
        },
        ...styleFields,
      },
      defaultProps: { templateId: '' },
      render: ({ templateId, ...s }) => (
        <Box s={s}>
          <TemplateRefView templateId={templateId} />
        </Box>
      ),
    },

    PageOutlet: {
      label: 'Page Slot',
      fields: {},
      defaultProps: {},
      render: () => <PageOutletView />,
    },

    // ── Forms ──────────────────────────────────────────────────────────────
    // Two ways to build a form. The four auth blocks below are complete and
    // working on their own; the native elements after them are for assembling
    // one by hand, and a Form Block's `handler` is what makes such an assembly
    // submit somewhere real.

    LoginForm: {
      label: 'Login Form',
      fields: {
        loginLabel: { type: 'text', label: 'Identifier label' },
        passwordLabel: { type: 'text', label: 'Password label' },
        submitLabel: { type: 'text', label: 'Button label' },
        showGoogle: {
          type: 'radio',
          label: 'Google sign-in',
          options: [
            { label: 'Show', value: 'true' },
            { label: 'Hide', value: 'false' },
          ],
        },
        showForgotLink: {
          type: 'radio',
          label: 'Forgot password link',
          options: [
            { label: 'Show', value: 'true' },
            { label: 'Hide', value: 'false' },
          ],
        },
        showSignupLink: {
          type: 'radio',
          label: 'Sign-up link',
          options: [
            { label: 'Show', value: 'true' },
            { label: 'Hide', value: 'false' },
          ],
        },
        ...styleFields,
      },
      defaultProps: {
        loginLabel: 'Email or username',
        passwordLabel: 'Password',
        submitLabel: 'Sign in',
        showGoogle: 'true',
        showForgotLink: 'true',
        showSignupLink: 'true',
      },
      render: (props) => <LoginFormView {...props} />,
    },

    RegisterForm: {
      label: 'Sign-up Form',
      fields: {
        usernameLabel: { type: 'text', label: 'Username label' },
        emailLabel: { type: 'text', label: 'Email label' },
        passwordLabel: { type: 'text', label: 'Password label' },
        submitLabel: { type: 'text', label: 'Button label' },
        showNameFields: {
          type: 'radio',
          label: 'First / last name',
          options: [
            { label: 'Show', value: 'true' },
            { label: 'Hide', value: 'false' },
          ],
        },
        showLoginLink: {
          type: 'radio',
          label: 'Sign-in link',
          options: [
            { label: 'Show', value: 'true' },
            { label: 'Hide', value: 'false' },
          ],
        },
        ...styleFields,
      },
      defaultProps: {
        usernameLabel: 'Username',
        emailLabel: 'Email',
        passwordLabel: 'Password',
        submitLabel: 'Sign up',
        showNameFields: 'true',
        showLoginLink: 'true',
      },
      render: (props) => <RegisterFormView {...props} />,
    },

    ForgotPasswordForm: {
      label: 'Forgot Password Form',
      fields: {
        emailLabel: { type: 'text', label: 'Email label' },
        submitLabel: { type: 'text', label: 'Button label' },
        showLoginLink: {
          type: 'radio',
          label: 'Sign-in link',
          options: [
            { label: 'Show', value: 'true' },
            { label: 'Hide', value: 'false' },
          ],
        },
        ...styleFields,
      },
      defaultProps: {
        emailLabel: 'Email',
        submitLabel: 'Send reset link',
        showLoginLink: 'true',
      },
      render: (props) => <ForgotPasswordFormView {...props} />,
    },

    ResetPasswordForm: {
      label: 'Reset Password Form',
      fields: {
        passwordLabel: { type: 'text', label: 'New password label' },
        confirmLabel: { type: 'text', label: 'Confirm label' },
        submitLabel: { type: 'text', label: 'Button label' },
        expiredMessage: { type: 'textarea', label: 'Expired-link message' },
        ...styleFields,
      },
      defaultProps: {
        passwordLabel: 'New password',
        confirmLabel: 'Confirm password',
        submitLabel: 'Update password',
        expiredMessage: '',
      },
      render: (props) => <ResetPasswordFormView {...props} />,
    },

    FormBlock: {
      label: 'Form Block',
      fields: {
        /**
         * With a handler set, this form posts to the matching built-in endpoint
         * and the children must be named exactly as the server reads them —
         * a mistyped `name` is a form that fails with no message. The names are
         * listed here rather than only in the docs for that reason.
         *
         * Note this path cannot satisfy CAPTCHA: the `Recaptcha` block is a
         * placeholder that produces no token, so with CAPTCHA enabled only the
         * turnkey Login/Sign-up blocks can submit successfully.
         */
        handler: {
          type: 'select',
          label: 'Submits to',
          options: [
            { label: 'Nothing / custom action URL', value: 'none' },
            { label: 'Collect submissions (inbox)', value: 'collect' },
            { label: 'Sign in — name inputs: login, password', value: 'login' },
            { label: 'Sign up — name inputs: email, username, password', value: 'register' },
            { label: 'Forgot password — name input: email', value: 'forgotPassword' },
            {
              label: 'Reset password — name inputs: password, passwordConfirmation',
              value: 'resetPassword',
            },
          ],
        },
        formName: {
          type: 'text',
          label: 'Form name (Collect only — labels submissions in the inbox)',
        },
        successMessage: {
          type: 'text',
          label: 'Success message (Collect only)',
        },
        action: { type: 'text', label: 'Action URL (ignored when Submits to is set)' },
        method: {
          type: 'select',
          label: 'Method',
          options: [
            { label: 'POST', value: 'post' },
            { label: 'GET', value: 'get' },
          ],
        },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: {
        handler: 'none',
        action: '',
        method: 'post',
        formName: 'Contact form',
        successMessage: 'Thanks — we’ve received your message.',
        content: [],
      },
      render: (props) => <FormBlockView {...props} />,
    },

    Label: {
      label: 'Label',
      fields: {
        text: { type: 'text', label: 'Text' },
        forId: { type: 'text', label: 'For (input id)' },
        ...styleFields,
      },
      defaultProps: { text: 'Label', forId: '' },
      render: ({ text, forId, ...s }) => (
        <Box
          as="label"
          s={s}
          className="mb-1 block text-sm font-medium"
          {...(forId ? { htmlFor: forId } : {})}
        >
          {text}
        </Box>
      ),
    },

    Input: {
      label: 'Input',
      fields: {
        name: { type: 'text', label: 'Name' },
        inputType: {
          type: 'select',
          label: 'Type',
          options: ['text', 'email', 'tel', 'number', 'password', 'url', 'date'].map((v) => ({
            label: v,
            value: v,
          })),
        },
        placeholder: { type: 'text', label: 'Placeholder' },
        required: {
          type: 'radio',
          label: 'Required',
          options: [
            { label: 'No', value: 'false' },
            { label: 'Yes', value: 'true' },
          ],
        },
        ...styleFields,
      },
      defaultProps: { name: 'field', inputType: 'text', placeholder: '', required: 'false' },
      render: ({ name, inputType, placeholder, required, ...s }) => (
        <Box
          as="input"
          s={s}
          type={inputType}
          name={name}
          placeholder={placeholder || undefined}
          required={required === 'true'}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      ),
    },

    FileUpload: {
      label: 'File Upload',
      fields: {
        name: { type: 'text', label: 'Name' },
        accept: { type: 'text', label: 'Accept (e.g. image/*)' },
        ...styleFields,
      },
      defaultProps: { name: 'file', accept: '' },
      render: ({ name, accept, ...s }) => (
        <Box
          as="input"
          s={s}
          type="file"
          name={name}
          {...(accept ? { accept } : {})}
          className="w-full text-sm"
        />
      ),
    },

    TextArea: {
      label: 'Text Area',
      fields: {
        name: { type: 'text', label: 'Name' },
        placeholder: { type: 'text', label: 'Placeholder' },
        rows: { type: 'number', label: 'Rows' },
        required: {
          type: 'radio',
          label: 'Required',
          options: [
            { label: 'No', value: 'false' },
            { label: 'Yes', value: 'true' },
          ],
        },
        ...styleFields,
      },
      defaultProps: { name: 'message', placeholder: '', rows: 4, required: 'false' },
      render: ({ name, placeholder, rows, required, ...s }) => (
        <Box
          as="textarea"
          s={s}
          name={name}
          placeholder={placeholder || undefined}
          rows={Number(rows) || 4}
          required={required === 'true'}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      ),
    },

    Checkbox: {
      label: 'Checkbox',
      fields: {
        label: { type: 'text', label: 'Label' },
        name: { type: 'text', label: 'Name' },
        required: {
          type: 'radio',
          label: 'Required',
          options: [
            { label: 'No', value: 'false' },
            { label: 'Yes', value: 'true' },
          ],
        },
        ...styleFields,
      },
      defaultProps: { label: 'Checkbox', name: 'checkbox', required: 'false' },
      render: ({ label, name, required, ...s }) => (
        <Box as="label" s={s} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name={name} required={required === 'true'} />
          <span>{label}</span>
        </Box>
      ),
    },

    RadioButton: {
      label: 'Radio Button',
      fields: {
        label: { type: 'text', label: 'Label' },
        name: { type: 'text', label: 'Group name' },
        value: { type: 'text', label: 'Value' },
        ...styleFields,
      },
      defaultProps: { label: 'Radio', name: 'radio', value: 'option' },
      render: ({ label, name, value, ...s }) => (
        <Box as="label" s={s} className="flex items-center gap-2 text-sm">
          <input type="radio" name={name} value={value} />
          <span>{label}</span>
        </Box>
      ),
    },

    Select: {
      label: 'Select',
      fields: {
        name: { type: 'text', label: 'Name' },
        options: {
          type: 'array',
          label: 'Options',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            value: { type: 'text', label: 'Value' },
          },
          defaultItemProps: { label: 'Option', value: 'option' },
        },
        required: {
          type: 'radio',
          label: 'Required',
          options: [
            { label: 'No', value: 'false' },
            { label: 'Yes', value: 'true' },
          ],
        },
        ...styleFields,
      },
      defaultProps: {
        name: 'select',
        options: [
          { label: 'Option 1', value: '1' },
          { label: 'Option 2', value: '2' },
        ],
        required: 'false',
      },
      render: ({ name, options, required, ...s }) => {
        const opts = Array.isArray(options)
          ? (options as Array<{ label?: string; value?: string }>)
          : []
        return (
          <Box
            as="select"
            s={s}
            name={name}
            required={required === 'true'}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {opts.map((o, i) => (
              <option key={i} value={o.value ?? ''}>
                {o.label ?? ''}
              </option>
            ))}
          </Box>
        )
      },
    },

    // reCAPTCHA — visual placeholder; a live widget needs a provider site key
    // (Integrations) + a form-submission backend, which is a separate feature.
    Recaptcha: {
      label: 'reCAPTCHA',
      fields: { ...styleFields },
      defaultProps: {},
      render: ({ ...s }) => (
        <Box
          s={s}
          className="inline-flex items-center gap-2 rounded border border-input bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          reCAPTCHA placeholder — configure a provider in Integrations
        </Box>
      ),
    },

    FormButton: {
      label: 'Form Button',
      fields: { label: { type: 'text', label: 'Label' }, ...styleFields },
      defaultProps: { label: 'Submit' },
      render: ({ label, ...s }) => (
        <Box
          as="button"
          s={s}
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {label}
        </Box>
      ),
    },

    // ── Advanced (static / embed) ──────────────────────────────────────────
    Search: {
      label: 'Search',
      fields: {
        action: { type: 'text', label: 'Search action URL' },
        placeholder: { type: 'text', label: 'Placeholder' },
        buttonLabel: { type: 'text', label: 'Button label' },
        ...styleFields,
      },
      defaultProps: { action: '/search', placeholder: 'Search…', buttonLabel: 'Search' },
      render: ({ action, placeholder, buttonLabel, ...s }) => (
        <Box as="form" s={s} action={action || undefined} method="get" className="flex gap-2">
          <input
            type="search"
            name="q"
            placeholder={placeholder || undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {buttonLabel}
          </button>
        </Box>
      ),
    },

    // Background Video — autoplaying muted video behind a content slot.
    BackgroundVideo: {
      label: 'Background Video',
      fields: {
        src: { type: 'text', label: 'Video URL (.mp4 / .webm)' },
        poster: { type: 'text', label: 'Poster URL' },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: { src: '', poster: '', content: [] },
      render: ({ content: Content, src, poster, ...s }) => (
        <Box s={s} style={{ position: 'relative', overflow: 'hidden' }}>
          {src ? (
            <video
              src={src}
              poster={poster || undefined}
              autoPlay
              muted
              loop
              playsInline
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                zIndex: 0,
              }}
            />
          ) : null}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Content />
          </div>
        </Box>
      ),
    },

    // Code Embed — safe presentation HTML and approved iframe providers only.
    // Server persistence removes scripts, event handlers, and unknown origins.
    CodeEmbed: {
      label: 'Code Embed',
      fields: { html: { type: 'textarea', label: 'HTML' }, ...styleFields },
      defaultProps: { html: '<!-- Paste embed HTML here -->' },
      render: ({ html, ...s }) => (
        <Box s={s} dangerouslySetInnerHTML={{ __html: typeof html === 'string' ? html : '' }} />
      ),
    },

    // Map — Google Maps embed (no API key needed). Accepts a plain address, a
    // pasted "Share → Embed a map" URL, or a full <iframe …> snippet.
    Map: {
      label: 'Map',
      fields: {
        query: { type: 'text', label: 'Address, or paste a Google Maps embed URL' },
        height: { type: 'text', label: 'Height' },
        ...styleFields,
      },
      defaultProps: { query: 'New York', height: '320px' },
      render: ({ query, height, ...s }) => {
        const raw = typeof query === 'string' ? query.trim() : ''
        // Pull the src out of a pasted <iframe …>, else use the value as-is.
        const candidate = raw.match(/src=["']([^"']+)["']/i)?.[1] ?? raw
        // A Google Maps URL is used verbatim (keeps Google's exact framing/zoom);
        // anything else is treated as an address for the keyless embed.
        const isMapUrl = /^https:\/\/(www\.google\.com|maps\.google\.com)\//i.test(candidate)
        const src = !raw
          ? ''
          : isMapUrl
            ? candidate
            : `https://maps.google.com/maps?q=${encodeURIComponent(raw)}&output=embed`
        const minHeight = typeof height === 'string' && height.trim() ? height.trim() : '320px'
        return (
          <Box s={s}>
            {src ? (
              <iframe
                title="Map"
                src={src}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                style={{ width: '100%', height: '100%', minHeight, border: 0 }}
              />
            ) : (
              <div className="flex min-h-40 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
                Add an address or a Google Maps embed URL
              </div>
            )}
          </Box>
        )
      },
    },

    // Facebook — page plugin embed.
    Facebook: {
      label: 'Facebook',
      fields: { url: { type: 'text', label: 'Facebook page/post URL' }, ...styleFields },
      defaultProps: { url: '' },
      render: ({ url, ...s }) => (
        <Box s={s}>
          {url ? (
            <iframe
              title="Facebook"
              src={`https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(typeof url === 'string' ? url : '')}&tabs=timeline&width=340`}
              style={{ width: '100%', minHeight: 300, border: 0 }}
              loading="lazy"
              allow="encrypted-media"
            />
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
              Add a Facebook URL
            </div>
          )}
        </Box>
      ),
    },

    // X (Twitter) — official tweet embed iframe (parses the tweet id from the URL).
    XTwitter: {
      label: 'X (Twitter)',
      fields: { url: { type: 'text', label: 'Tweet URL' }, ...styleFields },
      defaultProps: { url: '' },
      render: ({ url, ...s }) => {
        const m = (typeof url === 'string' ? url : '').match(/status\/(\d+)/)
        const id = m ? m[1] : null
        return (
          <Box s={s}>
            {id ? (
              <iframe
                title="Tweet"
                src={`https://platform.twitter.com/embed/Tweet.html?id=${id}`}
                style={{ width: '100%', minHeight: 300, border: 0 }}
                loading="lazy"
              />
            ) : (
              <div className="flex min-h-40 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
                Add a tweet URL
              </div>
            )}
          </Box>
        )
      },
    },

    // Custom Element — render any (safe) tag name, e.g. a web component.
    CustomElement: {
      label: 'Custom Element',
      fields: {
        tag: { type: 'text', label: 'Tag name (e.g. my-widget)' },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: { tag: 'div', content: [] },
      render: ({ content: Content, tag, ...s }) => {
        const safeTag = typeof tag === 'string' && /^[a-z][a-z0-9-]*$/.test(tag) ? tag : 'div'
        // A void tag (img/br/hr/input/…) cannot hold the slot; render it childless
        // instead of crashing the whole page with a React void-element invariant.
        if (VOID_TAGS.has(safeTag)) {
          return <Box as={safeTag as ElementType} s={s} />
        }
        return (
          <Box as={safeTag as ElementType} s={s}>
            <Content />
          </Box>
        )
      },
    },

    // Code Block — display (escaped) source code in a <pre><code>.
    CodeBlock: {
      label: 'Code Block',
      fields: { code: { type: 'textarea', label: 'Code' }, ...styleFields },
      defaultProps: { code: 'console.log("Hello, world")' },
      render: ({ code, ...s }) => (
        <Box as="pre" s={s} className="overflow-auto rounded-md bg-muted p-4 text-sm">
          <code>{typeof code === 'string' ? code : ''}</code>
        </Box>
      ),
    },

    // ── Advanced (interactive) ─────────────────────────────────────────────
    // Real components (hooks) in blocks-interactive.tsx; render delegates to them.
    Dropdown: {
      label: 'Dropdown',
      fields: {
        label: { type: 'text', label: 'Button label' },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: { label: 'Menu', content: [] },
      render: (props) => <DropdownView {...props} />,
    },

    Lightbox: {
      label: 'Lightbox',
      fields: {
        thumbnail: { type: 'text', label: 'Thumbnail URL' },
        full: { type: 'text', label: 'Full image URL' },
        alt: { type: 'text', label: 'Alt text' },
        ...styleFields,
      },
      defaultProps: { thumbnail: '', full: '', alt: '' },
      render: (props) => <LightboxView {...props} />,
    },

    Navbar: {
      label: 'Navbar',
      fields: {
        brand: { type: 'text', label: 'Brand' },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: { brand: 'Brand', content: [] },
      render: (props) => <NavbarView {...props} />,
    },

    Slider: {
      label: 'Slider',
      fields: {
        slides: {
          type: 'array',
          label: 'Slides',
          arrayFields: {
            src: { type: 'text', label: 'Image URL' },
            alt: { type: 'text', label: 'Alt' },
          },
          defaultItemProps: { src: '', alt: '' },
        },
        ...styleFields,
      },
      defaultProps: { slides: [] },
      render: (props) => <SliderView {...props} />,
    },

    // Carousel — slot-based slideshow; slides are child blocks. Auto-loop (slide
    // or continuous marquee) runs only on the published page via `initCarousels`.
    Carousel: {
      label: 'Carousel',
      inline: true,
      fields: {
        mode: {
          type: 'select',
          label: 'Mode',
          options: [
            { label: 'Slideshow (auto-advance)', value: 'slide' },
            { label: 'Marquee (continuous scroll)', value: 'marquee' },
          ],
        },
        perView: { type: 'number', label: 'Slides visible', min: 1 },
        gap: { type: 'text', label: 'Gap' },
        interval: { type: 'number', label: 'Auto-advance every (s)', min: 1 },
        speed: { type: 'number', label: 'Marquee speed (s per loop)', min: 1 },
        arrows: {
          type: 'radio',
          label: 'Arrows',
          options: [
            { label: 'Show', value: 'true' },
            { label: 'Hide', value: 'false' },
          ],
        },
        dots: {
          type: 'radio',
          label: 'Dots',
          options: [
            { label: 'Show', value: 'true' },
            { label: 'Hide', value: 'false' },
          ],
        },
        pauseOnHover: {
          type: 'radio',
          label: 'Pause on hover',
          options: [
            { label: 'Yes', value: 'true' },
            { label: 'No', value: 'false' },
          ],
        },
        content: { type: 'slot' },
        ...styleFields,
      },
      defaultProps: {
        mode: 'slide',
        perView: 1,
        gap: '16px',
        interval: 4,
        speed: 20,
        arrows: 'true',
        dots: 'true',
        pauseOnHover: 'true',
        content: [],
      },
      render: (props) => <CarouselView {...props} />,
    },

    Tabs: {
      label: 'Tabs',
      fields: {
        tabs: {
          type: 'array',
          label: 'Tabs',
          arrayFields: {
            label: { type: 'text', label: 'Label' },
            body: { type: 'textarea', label: 'Body' },
          },
          defaultItemProps: { label: 'Tab', body: 'Content' },
        },
        ...styleFields,
      },
      defaultProps: {
        tabs: [
          { label: 'Tab 1', body: 'Content 1' },
          { label: 'Tab 2', body: 'Content 2' },
        ],
      },
      render: (props) => <TabsView {...props} />,
    },

    // Reviews — a curated grid of rating cards (manual entry; no Google API).
    Reviews: {
      label: 'Reviews',
      fields: {
        heading: { type: 'text', label: 'Heading' },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [
            { label: '1', value: '1' },
            { label: '2', value: '2' },
            { label: '3', value: '3' },
            { label: '4', value: '4' },
          ],
        },
        showAggregate: {
          type: 'radio',
          label: 'Show average',
          options: [
            { label: 'Yes', value: 'true' },
            { label: 'No', value: 'false' },
          ],
        },
        reviews: {
          type: 'array',
          label: 'Reviews',
          arrayFields: {
            author: { type: 'text', label: 'Name' },
            rating: {
              type: 'select',
              label: 'Rating',
              options: [1, 2, 3, 4, 5].map((n) => ({
                label: `${n} star${n === 1 ? '' : 's'}`,
                value: String(n),
              })),
            },
            text: { type: 'textarea', label: 'Review' },
            date: { type: 'text', label: 'Date' },
            avatar: { type: 'text', label: 'Avatar URL' },
          },
          defaultItemProps: { author: '', rating: '5', text: '', date: '', avatar: '' },
        },
        ...styleFields,
      },
      defaultProps: {
        heading: 'What our customers say',
        columns: '3',
        showAggregate: 'true',
        reviews: [
          {
            author: 'Alex Doe',
            rating: '5',
            text: 'Fantastic experience — highly recommend!',
            date: '2 weeks ago',
            avatar: '',
          },
          {
            author: 'Sam Lee',
            rating: '5',
            text: 'Great service and support.',
            date: '1 month ago',
            avatar: '',
          },
          {
            author: 'Jordan Park',
            rating: '4',
            text: 'Really solid, would use again.',
            date: '1 month ago',
            avatar: '',
          },
        ],
      },
      render: (props) => <ReviewsView {...props} />,
    },

    Spacer: {
      label: 'Spacer',
      fields: { height: { type: 'text', label: 'Height' } },
      defaultProps: { height: '40px' },
      // Routed through Box (not a bare div) so it honours `_hidden` like every
      // other block.
      render: ({ height, ...s }) => <Box s={s} style={{ height: height || '40px' }} />,
    },

    Divider: {
      label: 'Divider',
      fields: { ...styleFields },
      defaultProps: {},
      render: ({ ...s }) => (
        <Box s={s}>
          <hr className="border-border" />
        </Box>
      ),
    },
  },
}

/**
 * Modules fold their own blocks in here rather than being imported by name
 * above — see `module-blocks.ts`. Core stays ignorant of which modules exist.
 * First-party blocks written for this project fold in the same way from
 * `inertia/custom/blocks/`, after modules so neither can shadow the other.
 */
/**
 * The full config — core blocks plus module and custom contributions — resolved
 * on first read rather than at import.
 *
 * The module blocks are collected by an eager `import.meta.glob`, and a module's
 * block file can reach back here (ecommerce: blocks → storefront layout →
 * public-page-frame → this config). That is a legitimate cycle in ESM, but
 * when Rollup folds the cycle into one SSR chunk it may place this module's
 * body before the module that declares the contributed `blocks`; calling
 * `withModuleBlocks()` here at module evaluation then throws "Cannot access
 * 'blocks' before initialization" — on the production build only, since the
 * dev server evaluates modules separately. Reading through getters defers the
 * merge to render time, when every module has long finished initialising.
 * The merged pieces are memoised, so `puckConfig.components` keeps one identity.
 */
// Lock support: a `_locked` layer (toggled from the Layers panel) freezes its
// drag / delete / duplicate / edit affordances. Puck only exposes permissions
// per component, so attach the same resolver to every block. Unlocking always
// works because it's done from the Layers tree via a programmatic dispatch,
// which isn't gated by these (UI-level) permissions.
const lockedPermissions = { drag: false, duplicate: false, delete: false, edit: false }
function resolveLockPermissions(data: { props?: Record<string, unknown> }) {
  return data?.props?._locked ? lockedPermissions : {}
}

let resolvedConfig: Config | undefined
function fullConfig(): Config {
  if (!resolvedConfig) {
    const merged = withCustomBlocks(withModuleBlocks(baseConfig))
    // Attach the lock resolver here, not at import: this loop reads the merged
    // component set, and doing it eagerly would force the merge below to run
    // while this module is still initialising — see the cycle note above.
    for (const component of Object.values(merged.components ?? {})) {
      ;(component as { resolvePermissions?: typeof resolveLockPermissions }).resolvePermissions =
        resolveLockPermissions
    }
    resolvedConfig = merged
  }
  return resolvedConfig
}

export const puckConfig: Config = {
  get root() {
    return fullConfig().root
  },
  get categories() {
    return fullConfig().categories
  },
  get components() {
    return fullConfig().components
  },
}

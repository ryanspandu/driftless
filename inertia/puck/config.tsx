import { lazy, Suspense, type ElementType, type ReactNode } from 'react'
import type { Config } from '@measured/puck'
import { cn } from '~/lib/utils'
import { CollectionSourceField, CollectionList } from '~/puck/collection-list'
import { RichTextView } from '~/puck/rich-text-view'
import { styleFields, Box } from '~/puck/style-fields'
import { MediaField } from '~/puck/media-field'
import { TemplateRefField, TemplateRefView } from '~/puck/template-ref'
import { PageOutletView } from '~/puck/page-outlet'

// TipTap editor is lazy-loaded so it stays out of the SSR render path.
const RichTextField = lazy(() =>
  import('~/puck/rich-text-field').then((m) => ({ default: m.RichTextField }))
)

/**
 * Puck block registry for the Pages builder.
 *
 * Style-ready by design: every block spreads the shared `styleFields` and wraps
 * its output in `<Box>`, so new style controls (border, shadow, per-breakpoint…)
 * are added in ONE place and inherited everywhere. Block props are plain JSON,
 * so enriching the controls later needs no migration. The shared controls and
 * the `<Box>` renderer live in `~/puck/style-fields`.
 */

export const puckConfig: Config = {
  root: {
    render: ({ children }: { children?: ReactNode }) => <>{children}</>,
  },
  components: {
    Section: {
      label: 'Section',
      fields: { content: { type: 'slot' }, ...styleFields },
      defaultProps: { padding: '48px 24px', content: [] },
      render: ({ content: Content, ...s }) => (
        <Box as="section" s={s} className="w-full">
          <Content />
        </Box>
      ),
    },

    Container: {
      label: 'Container',
      fields: { content: { type: 'slot' }, ...styleFields },
      defaultProps: { maxWidth: '1100px', padding: '0 16px', content: [] },
      render: ({ content: Content, ...s }) => (
        <Box s={s}>
          <Content />
        </Box>
      ),
    },

    Columns: {
      label: 'Columns',
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
      render: ({ content: Content, count, gap, ...s }) => (
        <Box
          s={s}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Number(count) || 2}, minmax(0, 1fr))`,
            gap: gap || '24px',
          }}
        >
          <Content />
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
      render: ({ text, level, ...s }) => (
        <Box as={`h${level || '2'}` as ElementType} s={s} className="font-semibold tracking-tight">
          {text}
        </Box>
      ),
    },

    Text: {
      label: 'Text',
      fields: { text: { type: 'textarea', label: 'Text' }, ...styleFields },
      defaultProps: { text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' },
      render: ({ text, ...s }) => (
        <Box s={s} style={{ whiteSpace: 'pre-line' }}>
          {text}
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
      render: ({ label, href, variant, ...s }) => (
        <Box s={s}>
          <a
            href={href || '#'}
            className={cn(
              'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors',
              variant === 'primary' && 'bg-primary text-primary-foreground hover:opacity-90',
              variant === 'secondary' && 'bg-secondary text-secondary-foreground hover:opacity-90',
              variant === 'outline' && 'border border-input hover:bg-accent'
            )}
          >
            {label}
          </a>
        </Box>
      ),
    },

    Image: {
      label: 'Image',
      fields: {
        src: {
          type: 'custom',
          label: 'Image',
          render: ({ value, onChange }) => <MediaField value={value} onChange={onChange} />,
        },
        alt: { type: 'text', label: 'Alt text' },
        ...styleFields,
      },
      defaultProps: { src: '', alt: '' },
      render: ({ src, alt, ...s }) => (
        <Box s={s}>
          {src ? (
            <img src={src} alt={alt || ''} className="h-auto max-w-full" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded border border-dashed text-sm text-muted-foreground">
              No image URL
            </div>
          )}
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
            <Suspense fallback={<div className="text-sm text-muted-foreground">Loading editor…</div>}>
              <RichTextField value={value} onChange={onChange} />
            </Suspense>
          ),
        },
        ...styleFields,
      },
      defaultProps: { html: '<p>Write rich text here…</p>' },
      render: ({ html, ...s }) => (
        <Box s={s}>
          <RichTextView html={html} />
        </Box>
      ),
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
        limit: { type: 'number', label: 'Max items' },
        columns: {
          type: 'select',
          label: 'Columns',
          options: [2, 3, 4].map((n) => ({ label: String(n), value: String(n) })),
        },
        ...styleFields,
      },
      defaultProps: { source: {}, limit: 6, columns: '3' },
      render: ({ source, limit, columns, ...s }) => (
        <Box s={s}>
          <CollectionList source={source} limit={limit} columns={columns} />
        </Box>
      ),
    },

    TemplateRef: {
      label: 'Template Reference',
      fields: {
        templateId: {
          type: 'custom',
          label: 'Template',
          render: ({ value, onChange }) => (
            <TemplateRefField value={value} onChange={onChange} />
          ),
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
      label: 'Page Outlet',
      fields: {},
      defaultProps: {},
      render: () => <PageOutletView />,
    },

    Spacer: {
      label: 'Spacer',
      fields: { height: { type: 'text', label: 'Height' } },
      defaultProps: { height: '40px' },
      render: ({ height }) => <div style={{ height: height || '40px' }} aria-hidden />,
    },

    Divider: {
      label: 'Divider',
      fields: { ...styleFields },
      defaultProps: { margin: '16px 0' },
      render: ({ ...s }) => (
        <Box s={s}>
          <hr className="border-border" />
        </Box>
      ),
    },
  },
}

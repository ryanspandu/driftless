import type { Config, Field } from '@measured/puck'
import type { CSSProperties, ReactNode } from 'react'

/**
 * A second, deliberately small Puck config for designing **emails**.
 *
 * The page builder's blocks cannot be reused here, and inlining their CSS would
 * not fix it. Three independent reasons:
 *
 *  1. They carry Tailwind classes (`bg-primary`, `text-muted-foreground`) that
 *     resolve through CSS custom properties in `oklch()`. An email has no
 *     stylesheet — clients strip `<style>` — so every one of those is dead.
 *  2. Flex and grid live in the *saved document*, not just in classes:
 *     `VFlex` ships `display:flex` in its `defaultProps`, `Columns` writes
 *     `gridTemplateColumns` inline. Outlook's Word engine ignores both, so a
 *     faithful CSS inliner still produces a stack of full-width rows.
 *  3. Around 35 of the ~50 page blocks are meaningless in mail — video, Lottie,
 *     Spline, Rive, iframes, forms, anything with a click handler.
 *
 * So: table-based layout, literal inline styles, hex colours, and a block set
 * short enough to be certain about. Everything here renders the same markup
 * `resources/views/emails/layout.edge` already uses by hand.
 *
 * A block whose output would be a guess is not offered at all. An email that
 * looks right in this editor and breaks in Outlook is the worst failure mode
 * available — invisible until a customer says so.
 */

type StyleBag = Record<string, unknown>

const str = (s: StyleBag, key: string): string => {
  const value = s[key]
  return typeof value === 'string' ? value.trim() : ''
}

/** A hex colour, or '' — never a token, a variable, or `oklch()`. */
const colour = (s: StyleBag, key: string, fallback = ''): string => {
  const value = str(s, key)
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback
}

/**
 * The style controls an email block gets.
 *
 * Deliberately a fraction of the page builder's `styleFields`. Everything
 * omitted — position, z-index, transform, filter, flex, grid, shadow — is
 * something email clients ignore, and offering a control that silently does
 * nothing is worse than not offering it.
 */
const emailStyleFields: Record<string, Field> = {
  paddingY: { type: 'text', label: 'Space above / below (px)' },
  align: {
    type: 'radio',
    label: 'Align',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
  },
  textColor: { type: 'text', label: 'Text colour (hex)' },
  fontSize: { type: 'text', label: 'Font size (px)' },
}

function pad(s: StyleBag): string {
  const value = str(s, 'paddingY')
  const n = Number(value.replace(/px$/, ''))
  return Number.isFinite(n) && n > 0 ? `${n}px 0` : '0'
}

function textStyle(s: StyleBag, base: CSSProperties): CSSProperties {
  const size = Number(str(s, 'fontSize').replace(/px$/, ''))
  return {
    ...base,
    ...(colour(s, 'textColor') ? { color: colour(s, 'textColor') } : null),
    ...(Number.isFinite(size) && size > 0 ? { fontSize: `${size}px` } : null),
    textAlign: (str(s, 'align') || 'left') as CSSProperties['textAlign'],
  }
}

/**
 * One full-width row.
 *
 * Every block is a `<table>` rather than a `<div>` because that is the only
 * layout primitive Outlook honours. `role="presentation"` keeps screen readers
 * from announcing it as data.
 */
function Row({ s, children }: { s: StyleBag; children: ReactNode }) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ borderCollapse: 'collapse', width: '100%' }}
    >
      <tbody>
        <tr>
          <td style={{ padding: pad(s) }}>{children}</td>
        </tr>
      </tbody>
    </table>
  )
}

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export const emailPuckConfig: Config = {
  root: {
    render: ({ children }: { children?: ReactNode }) => (
      <div style={{ fontFamily: FONT_STACK, color: '#18181b', fontSize: '15px', lineHeight: 1.6 }}>
        {children}
      </div>
    ),
  },

  categories: {
    content: { title: 'Content', components: ['EmailHeading', 'EmailText', 'EmailButton'] },
    media: { title: 'Media', components: ['EmailImage'] },
    layout: { title: 'Layout', components: ['EmailDivider', 'EmailSpacer', 'EmailColumns'] },
    data: { title: 'Data', components: ['EmailBody'] },
  },

  components: {
    EmailHeading: {
      label: 'Heading',
      fields: {
        text: { type: 'text', label: 'Text' },
        level: {
          type: 'select',
          label: 'Level',
          options: [
            { label: 'H1', value: '1' },
            { label: 'H2', value: '2' },
          ],
        },
        ...emailStyleFields,
      },
      defaultProps: { text: 'Heading', level: '1', paddingY: '8', align: 'left' },
      render: ({ text, level, ...s }) => {
        const Tag = level === '2' ? 'h2' : 'h1'
        return (
          <Row s={s}>
            <Tag
              style={textStyle(s, {
                margin: 0,
                fontSize: level === '2' ? '16px' : '20px',
                fontWeight: 600,
                fontFamily: FONT_STACK,
              })}
            >
              {String(text ?? '')}
            </Tag>
          </Row>
        )
      },
    },

    EmailText: {
      label: 'Paragraph',
      fields: {
        text: { type: 'textarea', label: 'Text' },
        ...emailStyleFields,
      },
      defaultProps: { text: 'Write something here.', paddingY: '8', align: 'left' },
      render: ({ text, ...s }) => (
        <Row s={s}>
          <p style={textStyle(s, { margin: 0, fontFamily: FONT_STACK, lineHeight: 1.6 })}>
            {/* Newlines are honoured without needing <br>, which some clients mangle. */}
            <span style={{ whiteSpace: 'pre-line' }}>{String(text ?? '')}</span>
          </p>
        </Row>
      ),
    },

    EmailButton: {
      label: 'Button',
      fields: {
        label: { type: 'text', label: 'Label' },
        href: { type: 'text', label: 'Link URL (absolute)' },
        bg: { type: 'text', label: 'Background (hex)' },
        color: { type: 'text', label: 'Text colour (hex)' },
        ...emailStyleFields,
      },
      defaultProps: {
        label: 'Click here',
        href: '',
        bg: '#4f39f6',
        color: '#ffffff',
        paddingY: '12',
        align: 'left',
      },
      render: ({ label, href, ...s }) => (
        <Row s={s}>
          {/*
            The bulletproof button: a table cell carries the background and the
            radius, and the anchor carries the padding. A styled <button> or a
            padded <a> alone renders unpredictably in Outlook.
          */}
          <table
            role="presentation"
            cellPadding={0}
            cellSpacing={0}
            style={{
              borderCollapse: 'collapse',
              margin: str(s, 'align') === 'center' ? '0 auto' : undefined,
            }}
          >
            <tbody>
              <tr>
                <td style={{ backgroundColor: colour(s, 'bg', '#4f39f6'), borderRadius: '8px' }}>
                  <a
                    href={String(href ?? '') || '#'}
                    style={{
                      display: 'inline-block',
                      padding: '12px 24px',
                      fontFamily: FONT_STACK,
                      fontSize: '15px',
                      fontWeight: 600,
                      color: colour(s, 'color', '#ffffff'),
                      textDecoration: 'none',
                    }}
                  >
                    {String(label ?? '')}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </Row>
      ),
    },

    EmailImage: {
      label: 'Image',
      fields: {
        src: { type: 'text', label: 'Image URL (absolute)' },
        alt: { type: 'text', label: 'Alt text' },
        width: { type: 'text', label: 'Width (px)' },
        ...emailStyleFields,
      },
      defaultProps: { src: '', alt: '', width: '', paddingY: '8', align: 'left' },
      render: ({ src, alt, width, ...s }) => {
        const w = Number(String(width ?? '').replace(/px$/, ''))
        return (
          <Row s={s}>
            <div style={{ textAlign: (str(s, 'align') || 'left') as CSSProperties['textAlign'] }}>
              {src ? (
                <img
                  src={String(src)}
                  /*
                   * `alt` matters more here than on a web page: most clients
                   * block remote images by default, so for many recipients the
                   * alt text *is* the image. An explicit width stops the
                   * blocked-image placeholder collapsing the layout.
                   */
                  alt={String(alt ?? '')}
                  {...(Number.isFinite(w) && w > 0 ? { width: w } : {})}
                  style={{ display: 'inline-block', maxWidth: '100%', border: 0 }}
                />
              ) : (
                <span style={{ color: '#a1a1aa', fontSize: '13px' }}>No image URL</span>
              )}
            </div>
          </Row>
        )
      },
    },

    EmailDivider: {
      label: 'Divider',
      fields: {
        color: { type: 'text', label: 'Colour (hex)' },
        ...emailStyleFields,
      },
      defaultProps: { color: '#e4e4e7', paddingY: '12' },
      render: ({ ...s }) => (
        <Row s={s}>
          {/*
            A bordered cell rather than <hr>: Outlook gives <hr> its own
            unremovable margins, so spacing above and below stops being ours.
          */}
          <table
            role="presentation"
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            style={{ borderCollapse: 'collapse' }}
          >
            <tbody>
              <tr>
                <td
                  style={{
                    borderTop: `1px solid ${colour(s, 'color', '#e4e4e7')}`,
                    fontSize: 0,
                    lineHeight: 0,
                    height: 0,
                  }}
                >
                  &nbsp;
                </td>
              </tr>
            </tbody>
          </table>
        </Row>
      ),
    },

    EmailSpacer: {
      label: 'Spacer',
      fields: { height: { type: 'text', label: 'Height (px)' } },
      defaultProps: { height: '24' },
      render: ({ height }) => {
        const h = Number(String(height ?? '24').replace(/px$/, '')) || 24
        return (
          <table
            role="presentation"
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            style={{ borderCollapse: 'collapse' }}
          >
            <tbody>
              <tr>
                {/* `font-size:0; line-height:0` or Outlook adds a text line's height. */}
                <td style={{ height: `${h}px`, fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
              </tr>
            </tbody>
          </table>
        )
      },
    },

    EmailColumns: {
      label: 'Two columns',
      fields: {
        left: { type: 'slot' },
        right: { type: 'slot' },
        ...emailStyleFields,
      },
      defaultProps: { left: [], right: [], paddingY: '8' },
      render: ({ left: Left, right: Right, ...s }) => (
        <Row s={s}>
          {/*
            Two cells, not flex. They do not stack on narrow screens — email
            has no reliable media queries — so this is for genuinely
            side-by-side content, not a responsive layout.
          */}
          <table
            role="presentation"
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            style={{ borderCollapse: 'collapse' }}
          >
            <tbody>
              <tr>
                <td width="50%" valign="top" style={{ paddingRight: '8px' }}>
                  <Left />
                </td>
                <td width="50%" valign="top" style={{ paddingLeft: '8px' }}>
                  <Right />
                </td>
              </tr>
            </tbody>
          </table>
        </Row>
      ),
    },

    EmailBody: {
      label: 'Order / details block',
      fields: { ...emailStyleFields },
      defaultProps: { paddingY: '8' },
      render: ({ ...s }) => (
        <Row s={s}>
          {/*
            The placeholder for whatever the service composes — the order table,
            the reset link, the tracking number. Rendered as a marker here and
            substituted at send time, so an operator can place it but cannot
            delete its contents or edit them into something wrong.
          */}
          <div
            data-email-body-slot=""
            style={{
              border: '1px dashed #d4d4d8',
              borderRadius: '6px',
              padding: '12px',
              color: '#71717a',
              fontFamily: FONT_STACK,
              fontSize: '13px',
              textAlign: 'center',
            }}
          >
            Order details / reset link are inserted here when the email is sent
          </div>
        </Row>
      ),
    },
  },
}

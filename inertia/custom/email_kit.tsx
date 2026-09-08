import type { CSSProperties, ReactNode } from 'react'

/**
 * Primitives for a kit **code email template** — `emails/<name>.tsx` in a kit.
 *
 * A code email is the coded twin of a Puck-designed EMAIL template: it is
 * flattened to inline-styled, table-based HTML at BUILD time (the send-time
 * worker has no React), then string-substituted when the email goes out. These
 * helpers emit exactly the same email-safe markup the Puck email blocks do, so a
 * code email renders identically to a designed one. See
 * `docs/ai/custom-templates.md` (Email templates) for the full contract.
 *
 * Rules an email must obey (email clients strip `<style>`, ignore flex/grid, and
 * block remote assets): **inline styles only, literal hex colours** (no Tailwind,
 * no CSS variables, no `oklch()`), **tables not flex/grid**, no external
 * stylesheet or web fonts. Writing raw inline-styled JSX is allowed; these
 * primitives just make the safe path the easy one.
 */

/**
 * The variables an email may interpolate, as `{{token}}` placeholders.
 *
 * At build time every access returns its own `{{token}}` string, so
 * `{siteName}` renders the literal `{{siteName}}`; the send path replaces it
 * with the real value. Only the tokens the wired mail event declares get a
 * value — any other token is left visible in the inbox, so use the event's
 * documented `variables` (Settings → Email → Notifications lists them).
 */
export type EmailVars = { [token: string]: string }

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

type Align = 'left' | 'center' | 'right'

/** One full-width row — a `<table>`, the only layout primitive Outlook honours. */
function Row({ paddingY = 8, children }: { paddingY?: number; children: ReactNode }) {
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
          <td style={{ padding: paddingY > 0 ? `${paddingY}px 0` : '0' }}>{children}</td>
        </tr>
      </tbody>
    </table>
  )
}

/**
 * The email shell: the outer `<div>` that sets the base font, colour and size.
 *
 * Wrap the whole email in one `<EmailRoot>`. It is NOT a full HTML document —
 * `@adonisjs/mail` supplies the MIME envelope — so do not add `<html>`/`<head>`.
 */
export function EmailRoot({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: FONT_STACK, color: '#18181b', fontSize: '15px', lineHeight: 1.6 }}>
      {children}
    </div>
  )
}

export function EmailHeading({
  children,
  level = 1,
  align = 'left',
  color,
  paddingY = 8,
}: {
  children: ReactNode
  level?: 1 | 2
  align?: Align
  color?: string
  paddingY?: number
}) {
  const style: CSSProperties = {
    margin: 0,
    fontFamily: FONT_STACK,
    fontSize: level === 2 ? '16px' : '20px',
    fontWeight: 600,
    textAlign: align,
    ...(color ? { color } : null),
  }
  return (
    <Row paddingY={paddingY}>
      {level === 2 ? <h2 style={style}>{children}</h2> : <h1 style={style}>{children}</h1>}
    </Row>
  )
}

export function EmailText({
  children,
  align = 'left',
  color,
  paddingY = 8,
}: {
  children: ReactNode
  align?: Align
  color?: string
  paddingY?: number
}) {
  return (
    <Row paddingY={paddingY}>
      <p
        style={{
          margin: 0,
          fontFamily: FONT_STACK,
          lineHeight: 1.6,
          textAlign: align,
          ...(color ? { color } : null),
        }}
      >
        {/* pre-line honours newlines without <br>, which some clients mangle. */}
        <span style={{ whiteSpace: 'pre-line' }}>{children}</span>
      </p>
    </Row>
  )
}

export function EmailButton({
  href,
  children,
  bg = '#4f39f6',
  color = '#ffffff',
  align = 'left',
  paddingY = 12,
}: {
  href: string
  children: ReactNode
  bg?: string
  color?: string
  align?: Align
  paddingY?: number
}) {
  return (
    <Row paddingY={paddingY}>
      {/* Bulletproof button: the cell carries the background + radius, the anchor
          the padding — a styled <button> or padded <a> renders unpredictably in Outlook. */}
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ borderCollapse: 'collapse', margin: align === 'center' ? '0 auto' : undefined }}
      >
        <tbody>
          <tr>
            <td style={{ backgroundColor: bg, borderRadius: '8px' }}>
              <a
                href={href || '#'}
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  fontFamily: FONT_STACK,
                  fontSize: '15px',
                  fontWeight: 600,
                  color,
                  textDecoration: 'none',
                }}
              >
                {children}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  )
}

export function EmailDivider({
  color = '#e4e4e7',
  paddingY = 12,
}: {
  color?: string
  paddingY?: number
}) {
  return (
    <Row paddingY={paddingY}>
      {/* A bordered cell rather than <hr>: Outlook gives <hr> its own margins. */}
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ borderCollapse: 'collapse' }}
      >
        <tbody>
          <tr>
            <td style={{ borderTop: `1px solid ${color}`, fontSize: 0, lineHeight: 0, height: 0 }}>
              &nbsp;
            </td>
          </tr>
        </tbody>
      </table>
    </Row>
  )
}

export function EmailSpacer({ height = 24 }: { height?: number }) {
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
          {/* font-size:0; line-height:0 or Outlook adds a text line's height. */}
          <td style={{ height: `${height}px`, fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
        </tr>
      </tbody>
    </table>
  )
}

/**
 * The service-composed slot — the order table, the reset link, the tracking
 * number. Place ONE where that content should appear; the send path replaces
 * this whole element with the finished HTML the owning service builds. An
 * operator can place it but never authors what goes inside, which is what stops
 * a design change shipping a receipt with no receipt in it.
 *
 * Renders a FLAT `<div data-email-body-slot>` (no nested `<div>`) — the send-time
 * matcher is non-greedy to the first `</div>`, so this element takes no children.
 * Omitting it silently drops the order table / reset link, so an email that
 * needs one must include exactly one `<EmailBody/>`.
 */
export function EmailBody({ paddingY = 8 }: { paddingY?: number }) {
  return (
    <Row paddingY={paddingY}>
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
  )
}

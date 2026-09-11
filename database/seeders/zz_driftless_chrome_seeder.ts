import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Template from '#models/template'
import TemplatesService from '#services/templates_service'
import { newUlid } from '#services/ulid_service'

/**
 * The Driftless-toned default HEADER and FOOTER, as builder templates.
 *
 * These become the SITE DEFAULT chrome (`is_default = true`), so every page with
 * no pinned header/footer — including the `home` landing page — renders wearing
 * Driftless branding instead of the StaticBloom demo chrome.
 *
 * Filename sorts AFTER `staticbloom_home_seeder` on purpose: StaticBloom creates
 * and PINS its own header/footer first, so demoting the previous default here
 * (via `TemplatesService`, which clears other defaults + invalidates snapshots)
 * leaves the pinned StaticBloom page untouched while flipping the site default to
 * Driftless. Idempotent by template name — applies on an existing DB (flips the
 * default) and no-ops on re-runs.
 */

function block(type: string, props: Record<string, unknown> = {}) {
  return { type, props: { id: `${type}-${newUlid().toLowerCase().slice(-10)}`, ...props } }
}

/** Container tagged `drift-flow`, paired with the `display:contents` slot fix. */
function box(type: string, props: Record<string, unknown> = {}) {
  const className = ['drift-flow', props.className].filter(Boolean).join(' ')
  return block(type, { ...props, className })
}

const C = {
  primary: 'var(--primary)',
  primaryFg: 'var(--primary-foreground)',
  fg: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  bg: 'var(--background)',
  line: 'var(--border)',
  onPrimary: 'var(--primary-foreground)',
  onPrimaryMuted: 'color-mix(in oklch, var(--primary-foreground) 68%, transparent)',
}

const HEADER_CSS = `
.drift-flow > div:only-child{display:contents}
.drift-header{backdrop-filter:saturate(180%) blur(12px);-webkit-backdrop-filter:saturate(180%) blur(12px)}
.drift-nav a{font-size:13.5px;font-weight:500;color:var(--muted-foreground);text-decoration:none;transition:color .15s ease}
.drift-nav a:hover{color:var(--foreground)}
@media (max-width:820px){.drift-nav{display:none!important}}
`.trim()

const FOOTER_CSS = `
.drift-flow > div:only-child{display:contents}
.drift-foot-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:40px}
.drift-foot-grid a{font-size:12.5px;color:color-mix(in oklch, var(--primary-foreground) 68%, transparent);text-decoration:none;transition:color .15s ease}
.drift-foot-grid a:hover{color:var(--primary-foreground)}
.drift-foot-bar{border-top:1px solid color-mix(in oklch, var(--primary-foreground) 16%, transparent)}
@media (max-width:820px){.drift-foot-grid{grid-template-columns:1fr 1fr;gap:30px}}
@media (max-width:560px){.drift-foot-grid{grid-template-columns:1fr}.drift-foot-bar{flex-direction:column;gap:8px}}
`.trim()

function doc(content: unknown[], css: string, snippetId: string) {
  return {
    root: {
      props: {
        codeSnippets: [
          { id: snippetId, name: 'Driftless chrome styles', lang: 'css', code: css, enabled: true },
        ],
      },
    },
    zones: {},
    content,
  }
}

function navLink(text: string, href: string) {
  return block('TextLink', { text, href, newTab: 'false', textDecoration: 'none' })
}

// ── Header ───────────────────────────────────────────────────────────────────

function headerContent() {
  return doc(
    [
      box('Section', {
        _label: 'Site header',
        className: 'drift-header',
        bg: 'color-mix(in oklch, var(--background) 80%, transparent)',
        borderWidth: '0 0 1px 0',
        borderStyle: 'solid',
        borderColor: C.line,
        padding: '13px 24px',
        position: 'sticky',
        top: '0',
        zIndex: '50',
        boxShadow: '0 1px 12px -6px color-mix(in oklch, var(--foreground) 30%, transparent)',
        content: [
          box('Container', {
            maxWidth: '1200px',
            padding: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '24px',
            content: [
              box('LinkBlock', {
                _label: 'Logo',
                href: '/',
                newTab: 'false',
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                textDecoration: 'none',
                content: [
                  box('DivBlock', {
                    _label: 'Logo mark',
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    bg: C.primary,
                    backgrounds: [
                      {
                        id: 'drift-logo-grad',
                        type: 'linear',
                        angle: '145',
                        stops: [
                          { color: '#3d34d6', pos: '0%' },
                          { color: '#221aa8', pos: '100%' },
                        ],
                      },
                    ],
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    content: [
                      block('Text', {
                        text: 'D',
                        textColor: C.onPrimary,
                        textSize: '15px',
                        fontWeight: '700',
                        lineHeight: '1',
                      }),
                    ],
                  }),
                  block('Text', {
                    text: 'Driftless',
                    textColor: C.fg,
                    textSize: '17px',
                    fontWeight: '700',
                    lineHeight: '1',
                  }),
                ],
              }),

              box('DivBlock', {
                _label: 'Nav',
                className: 'drift-nav',
                display: 'flex',
                alignItems: 'center',
                gap: '28px',
                content: [
                  navLink('Features', '#features'),
                  navLink('Why us', '#why'),
                  navLink('Stories', '#testimonials'),
                ],
              }),

              block('Button', {
                _label: 'Header CTA',
                label: 'Get started free',
                href: '/register',
                variant: 'primary',
              }),
            ],
          }),
        ],
      }),
    ],
    HEADER_CSS,
    'drift-header-css'
  )
}

// ── Footer ───────────────────────────────────────────────────────────────────

function footerColumn(title: string, links: { text: string; href: string }[]) {
  return box('DivBlock', {
    _label: `Footer — ${title}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '11px',
    content: [
      block('Heading', {
        text: title,
        level: '4',
        textSize: '10.5px',
        fontWeight: '600',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        textColor: C.onPrimary,
        margin: '0 0 4px 0',
      }),
      ...links.map((l) => navLink(l.text, l.href)),
    ],
  })
}

function footerContent() {
  return doc(
    [
      box('Section', {
        _label: 'Site footer',
        className: 'drift-footer',
        bg: C.primary,
        backgrounds: [
          {
            id: 'drift-foot-glow',
            type: 'radial',
            shape: 'ellipse',
            extent: 'farthest-side',
            posX: '82%',
            posY: '-20%',
            stops: [
              { color: 'rgba(255,255,255,0.12)', pos: '0%' },
              { color: 'rgba(255,255,255,0)', pos: '55%' },
            ],
          },
          {
            id: 'drift-foot-grad',
            type: 'linear',
            angle: '180',
            stops: [
              { color: 'color-mix(in oklch, var(--primary) 96%, white)', pos: '0%' },
              { color: 'color-mix(in oklch, var(--primary) 78%, black)', pos: '100%' },
            ],
          },
        ],
        overflow: 'hidden',
        padding: '56px 24px 0',
        content: [
          box('Container', {
            maxWidth: '1200px',
            padding: '0 0 24px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '40px',
            content: [
              box('DivBlock', {
                _label: 'Footer columns',
                className: 'drift-foot-grid',
                content: [
                  box('DivBlock', {
                    _label: 'Footer — brand',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    maxWidth: '300px',
                    content: [
                      box('DivBlock', {
                        _label: 'Footer logo',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '9px',
                        content: [
                          box('DivBlock', {
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            bg: 'color-mix(in oklch, var(--primary-foreground) 16%, transparent)',
                            borderWidth: '1px',
                            borderStyle: 'solid',
                            borderColor:
                              'color-mix(in oklch, var(--primary-foreground) 22%, transparent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            content: [
                              block('Text', {
                                text: 'D',
                                textColor: C.onPrimary,
                                textSize: '15px',
                                fontWeight: '700',
                                lineHeight: '1',
                              }),
                            ],
                          }),
                          block('Text', {
                            text: 'Driftless',
                            textColor: C.onPrimary,
                            textSize: '18px',
                            fontWeight: '700',
                            lineHeight: '1',
                          }),
                        ],
                      }),
                      block('Paragraph', {
                        text: 'Model, manage, and publish content from one fast, offline-first workspace.',
                        textColor: C.onPrimaryMuted,
                        textSize: '13px',
                        lineHeight: '1.7',
                        margin: '0',
                      }),
                    ],
                  }),
                  footerColumn('Product', [
                    { text: 'Features', href: '#features' },
                    { text: 'Why us', href: '#why' },
                    { text: 'Stories', href: '#testimonials' },
                  ]),
                  footerColumn('Company', [
                    { text: 'About', href: '#' },
                    { text: 'Careers', href: '#' },
                    { text: 'Contact', href: '#' },
                  ]),
                  footerColumn('Resources', [
                    { text: 'Docs', href: '#' },
                    { text: 'Blog', href: '#' },
                    { text: 'Support', href: '#' },
                  ]),
                ],
              }),
              box('DivBlock', {
                _label: 'Footer baseline',
                className: 'drift-foot-bar',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '20px 0',
                content: [
                  block('Text', {
                    text: '© 2026 Driftless. All rights reserved.',
                    textColor: C.onPrimaryMuted,
                    textSize: '12.5px',
                  }),
                  block('Text', {
                    text: 'Built for teams that move quickly and ship often.',
                    textColor: C.onPrimaryMuted,
                    textSize: '12.5px',
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
    FOOTER_CSS,
    'drift-footer-css'
  )
}

// ── Seeder ─────────────────────────────────────────────────────────────────

export default class extends BaseSeeder {
  async run() {
    const templates = new TemplatesService()
    await this.ensureDefault(templates, 'Driftless — Header', 'HEADER', headerContent())
    await this.ensureDefault(templates, 'Driftless — Footer', 'FOOTER', footerContent())
  }

  /**
   * Make the named template the site default for its type. Idempotent: creates
   * it default on first run (demoting the previous default), and only re-asserts
   * the default flag on later runs — never overwriting content someone edited.
   */
  private async ensureDefault(
    templates: TemplatesService,
    name: string,
    type: 'HEADER' | 'FOOTER',
    content: Record<string, unknown>
  ) {
    const existing = await Template.query()
      .where('name', name)
      .where('type', type)
      .whereNull('deleted_at')
      .first()

    if (existing) {
      if (!existing.isDefault) await templates.setDefault(existing.id)
      return
    }
    await templates.create({ name, type, content, isDefault: true })
  }
}

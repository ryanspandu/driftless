import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import Page from '#models/page'
import { newUlid } from '#services/ulid_service'
import { WebSettingsService } from '#services/settings_service'

/**
 * The default marketing landing page, as a builder document.
 *
 * A rich recreation of the built-in `inertia/pages/home.tsx` as ordinary builder
 * blocks — gradient hero + glow, an asset-free app-preview mockup, logos, a
 * two-column steps section, testimonials, and a glowing CTA — so the homepage is
 * fully editable at `/admin/pages`. Sections carry `scrollAnimation` props so they
 * reveal on scroll on the published page (the same feature the Interactions panel
 * writes). Header/footer come from the site-default templates (Driftless chrome),
 * not from this document.
 *
 * On first creation it points the front-page setting at itself, so `/` renders it.
 * Idempotent: an existing page at this path is left untouched. Colours reference
 * the app theme tokens (`var(--primary)` …), resolved in the public `.theme-light`.
 */

const PAGE_PATH = 'home'

/** Puck needs an id on every block; it is not derived from position. */
function block(type: string, props: Record<string, unknown> = {}) {
  return { type, props: { id: `${type}-${newUlid().toLowerCase().slice(-10)}`, ...props } }
}

/**
 * A container block tagged `lp-flow`. Puck renders a container's slot children
 * inside a `<div>` of its own; the `.lp-flow > div:only-child { display: contents }`
 * rule in {@link BASE_CSS} makes that wrapper transparent so the container's
 * flex/grid lays out the real children, not the wrapper.
 */
function box(type: string, props: Record<string, unknown> = {}) {
  const className = ['lp-flow', props.className].filter(Boolean).join(' ')
  return block(type, { ...props, className })
}

/** App theme tokens + tints (resolved in the public `.theme-light` scope). */
const C = {
  primary: 'var(--primary)',
  primaryFg: 'var(--primary-foreground)',
  primary5: 'color-mix(in oklch, var(--primary) 5%, transparent)',
  primary10: 'color-mix(in oklch, var(--primary) 10%, transparent)',
  primary15: 'color-mix(in oklch, var(--primary) 15%, transparent)',
  primary20: 'color-mix(in oklch, var(--primary) 20%, transparent)',
  primary40: 'color-mix(in oklch, var(--primary) 40%, transparent)',
  fg: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  card: 'var(--card)',
  bg: 'var(--background)',
  soft: 'color-mix(in oklch, var(--muted) 35%, transparent)',
  skel: 'color-mix(in oklch, var(--muted-foreground) 22%, transparent)',
  line: 'var(--border)',
}

const BASE_CSS = `
.lp-flow > div:only-child{display:contents}
section[id]{scroll-margin-top:80px}
.lp-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.lp-grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.lp-steps{display:grid;grid-template-columns:1.1fr 1fr;gap:44px;align-items:center}
.lp-preview-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.lp-logos{display:flex;flex-wrap:wrap;align-items:center;gap:14px 40px}
.lp-border-y{border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.lp-card{transition:box-shadow .2s ease,transform .2s ease}
.lp-card:hover{box-shadow:0 12px 20px -6px color-mix(in oklch, var(--primary) 14%, transparent);transform:translateY(-2px)}
@media (max-width:900px){.lp-grid-3,.lp-grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}.lp-steps{grid-template-columns:1fr;gap:32px}}
@media (max-width:640px){.lp-grid-3,.lp-grid-4{grid-template-columns:1fr}.lp-preview-cols{grid-template-columns:repeat(2,1fr)}}
`

function doc(content: unknown[]) {
  return {
    root: {
      props: {
        codeSnippets: [
          { id: 'lp-css', name: 'Landing styles', lang: 'css', code: BASE_CSS, enabled: true },
        ],
      },
    },
    zones: {},
    content,
  }
}

/** Scroll-into-view reveal props (matches the builder's Interactions panel). */
function fadeUp(delay?: string) {
  return {
    scrollAnimation: {
      type: 'fade-up',
      duration: '600ms',
      easing: 'ease-out',
      distance: '24px',
      ...(delay ? { delay } : {}),
    },
  }
}

const HERO_BG = [
  {
    id: 'lp-hero-glow',
    type: 'radial',
    shape: 'ellipse',
    extent: 'farthest-side',
    posX: '50%',
    posY: '-10%',
    stops: [
      { color: C.primary20, pos: '0%' },
      { color: 'transparent', pos: '70%' },
    ],
  },
  {
    id: 'lp-hero-wash',
    type: 'linear',
    angle: '180',
    stops: [
      { color: C.primary15, pos: '0%' },
      { color: C.primary5, pos: '45%' },
      { color: 'transparent', pos: '100%' },
    ],
  },
]

const CTA_BG = [
  {
    id: 'lp-cta-glow-tr',
    type: 'radial',
    shape: 'circle',
    extent: 'farthest-side',
    posX: '100%',
    posY: '0%',
    stops: [
      { color: 'rgba(255,255,255,0.18)', pos: '0%' },
      { color: 'rgba(255,255,255,0)', pos: '60%' },
    ],
  },
  {
    id: 'lp-cta-glow-bl',
    type: 'radial',
    shape: 'circle',
    extent: 'farthest-side',
    posX: '0%',
    posY: '100%',
    stops: [
      { color: 'rgba(255,255,255,0.15)', pos: '0%' },
      { color: 'rgba(255,255,255,0)', pos: '60%' },
    ],
  },
]

const STEPS_PANEL_BG = [
  {
    id: 'lp-steps-panel',
    type: 'linear',
    angle: '135',
    stops: [
      { color: C.primary20, pos: '0%' },
      { color: C.primary5, pos: '100%' },
    ],
  },
]

// ── Reusable pieces ──────────────────────────────────────────────────────────

function dot(color: string) {
  return box('DivBlock', { width: '11px', height: '11px', borderRadius: '999px', bg: color })
}

function skel(width: string, height = '8px') {
  return box('DivBlock', { width, height, borderRadius: '4px', bg: C.skel })
}

/**
 * Minimal line icons, rendered as an inline-SVG data URI on an Image block —
 * crisp and on-brand (stroke = the primary violet), unlike emoji. Stroke colour
 * is a literal hex because a data-URI SVG is its own document and can't read
 * `currentColor`/theme tokens.
 */
const IA =
  'xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5225e6" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'

const ICONS = {
  collections: `<svg ${IA}><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></svg>`,
  shield: `<svg ${IA}><path d="M12 3l7 3v5c0 4.6-3.1 7.7-7 9-3.9-1.3-7-4.4-7-9V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  media: `<svg ${IA}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m20 16-5-4L5 20"/></svg>`,
  cloud: `<svg ${IA}><path d="M17.5 19a4.5 4.5 0 0 0 .3-9A6 6 0 0 0 6.5 9 4 4 0 0 0 6 19h11.5Z"/></svg>`,
  clock: `<svg ${IA}><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>`,
  apps: `<svg ${IA}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
}

function iconImage(svg: string) {
  return block('Image', {
    src: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    alt: '',
    width: '22px',
    height: '22px',
  })
}

/** An asset-free faux dashboard, built from nested DivBlocks (like home.tsx). */
function appPreview(compact = false) {
  const columns: [string, string][] = [
    ['To Do', '#fbbf24'],
    ['In Progress', C.primary],
    ['In Review', '#a78bfa'],
    ['Completed', '#34d399'],
  ]
  const previewCard = () =>
    box('DivBlock', {
      bg: C.card,
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: C.line,
      borderRadius: '6px',
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      content: [skel('75%'), skel('50%')],
    })

  return box('DivBlock', {
    _label: 'App preview',
    bg: C.card,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.line,
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px color-mix(in oklch, var(--primary) 18%, transparent)',
    content: [
      // Chrome bar
      box('DivBlock', {
        _label: 'Chrome',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '11px 14px',
        bg: C.soft,
        borderWidth: '0 0 1px 0',
        borderStyle: 'solid',
        borderColor: C.line,
        content: [
          dot('#f87171'),
          dot('#fbbf24'),
          dot('#34d399'),
          box('DivBlock', {
            flexGrow: '1',
            display: 'flex',
            justifyContent: 'center',
            content: [
              box('DivBlock', {
                width: '160px',
                height: '18px',
                borderRadius: '6px',
                bg: 'color-mix(in oklch, var(--background) 70%, transparent)',
              }),
            ],
          }),
        ],
      }),
      // Body
      box('DivBlock', {
        _label: 'Board area',
        display: 'flex',
        content: [
          ...(compact
            ? []
            : [
                box('DivBlock', {
                  _label: 'Sidebar',
                  width: '150px',
                  padding: '16px',
                  borderWidth: '0 1px 0 0',
                  borderStyle: 'solid',
                  borderColor: C.line,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '11px',
                  content: [
                    box('DivBlock', {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      content: [
                        box('DivBlock', {
                          width: '22px',
                          height: '22px',
                          borderRadius: '6px',
                          bg: C.primary,
                        }),
                        skel('56px', '10px'),
                      ],
                    }),
                    skel('90%', '9px'),
                    skel('70%', '9px'),
                    skel('80%', '9px'),
                    skel('60%', '9px'),
                    skel('75%', '9px'),
                  ],
                }),
              ]),
          box('DivBlock', {
            _label: 'Board',
            flexGrow: '1',
            padding: '14px',
            className: 'lp-preview-cols',
            content: columns.map(([name, tone]) =>
              box('DivBlock', {
                _label: name,
                bg: C.soft,
                borderRadius: '8px',
                padding: '9px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                content: [
                  box('DivBlock', {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    content: [dot(tone), skel('44px', '8px')],
                  }),
                  previewCard(),
                  ...(name === 'Completed' ? [] : [previewCard()]),
                ],
              })
            ),
          }),
        ],
      }),
    ],
  })
}

function sectionHeading(eyebrow: string, title: string, subtitle?: string) {
  return box('DivBlock', {
    _label: 'Section heading',
    maxWidth: '640px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    align: 'center',
    ...fadeUp(),
    content: [
      block('Text', {
        text: eyebrow,
        textColor: C.primary,
        textSize: '13px',
        fontWeight: '600',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }),
      block('Heading', {
        text: title,
        level: '2',
        textSize: '32px',
        fontWeight: '700',
        lineHeight: '1.15',
        textColor: C.fg,
        align: 'center',
        margin: '0',
      }),
      ...(subtitle
        ? [
            block('Paragraph', {
              text: subtitle,
              textColor: C.muted,
              textSize: '16px',
              lineHeight: '1.6',
              align: 'center',
              margin: '0',
            }),
          ]
        : []),
    ],
  })
}

function featureCard(icon: string, title: string, body: string, delay?: string) {
  return box('DivBlock', {
    _label: `Feature — ${title}`,
    className: 'lp-card',
    bg: C.card,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.line,
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    ...fadeUp(delay),
    content: [
      box('DivBlock', {
        _label: 'Icon',
        width: '44px',
        height: '44px',
        borderRadius: '12px',
        bg: C.primary10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 0 6px 0',
        content: [iconImage(icon)],
      }),
      block('Heading', {
        text: title,
        level: '3',
        textSize: '17px',
        fontWeight: '600',
        textColor: C.fg,
        margin: '0',
      }),
      block('Paragraph', {
        text: body,
        textColor: C.muted,
        textSize: '14px',
        lineHeight: '1.6',
        margin: '0',
      }),
    ],
  })
}

function statCard(value: string, label: string, delay?: string) {
  return box('DivBlock', {
    _label: `Stat — ${value}`,
    bg: C.card,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.line,
    borderRadius: '16px',
    boxShadow: 'sm',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    ...fadeUp(delay),
    content: [
      block('Heading', {
        text: value,
        level: '3',
        textSize: '34px',
        fontWeight: '700',
        textColor: C.primary,
        margin: '0',
      }),
      block('Text', { text: label, textColor: C.muted, textSize: '14px', lineHeight: '1.5' }),
    ],
  })
}

function stepCard(n: string, title: string, body: string, delay?: string) {
  return box('DivBlock', {
    _label: `Step — ${title}`,
    bg: C.card,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.line,
    borderRadius: '16px',
    padding: '20px',
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-start',
    ...fadeUp(delay),
    content: [
      box('DivBlock', {
        _label: 'Step number',
        width: '36px',
        height: '36px',
        borderRadius: '999px',
        bg: C.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        content: [
          block('Text', {
            text: n,
            textColor: C.primaryFg,
            textSize: '14px',
            fontWeight: '600',
            lineHeight: '1',
          }),
        ],
      }),
      box('DivBlock', {
        _label: 'Step body',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        content: [
          block('Heading', {
            text: title,
            level: '3',
            textSize: '16px',
            fontWeight: '600',
            textColor: C.fg,
            margin: '0',
          }),
          block('Paragraph', {
            text: body,
            textColor: C.muted,
            textSize: '14px',
            lineHeight: '1.6',
            margin: '0',
          }),
        ],
      }),
    ],
  })
}

function testimonialCard(quote: string, name: string, role: string, delay?: string) {
  return box('DivBlock', {
    _label: `Testimonial — ${name}`,
    className: 'lp-card',
    bg: C.card,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.line,
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    ...fadeUp(delay),
    content: [
      block('Text', { text: '“', textColor: C.primary40, textSize: '40px', lineHeight: '0.5' }),
      block('Paragraph', {
        text: quote,
        textColor: C.fg,
        textSize: '14px',
        lineHeight: '1.7',
        margin: '0',
      }),
      block('Text', {
        text: '★★★★★',
        textColor: C.primary,
        textSize: '14px',
        letterSpacing: '0.1em',
      }),
      box('DivBlock', {
        _label: 'Author',
        borderWidth: '1px 0 0 0',
        borderStyle: 'solid',
        borderColor: C.line,
        padding: '14px 0 0 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        content: [
          block('Text', { text: name, textColor: C.fg, textSize: '14px', fontWeight: '600' }),
          block('Text', { text: role, textColor: C.muted, textSize: '12.5px' }),
        ],
      }),
    ],
  })
}

// ── Page ─────────────────────────────────────────────────────────────────────

function pageContent() {
  return doc([
    // Hero
    box('Section', {
      _label: 'Hero',
      bg: C.bg,
      backgrounds: HERO_BG,
      overflow: 'hidden',
      padding: '112px 24px 56px',
      content: [
        box('Container', {
          maxWidth: '920px',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          align: 'center',
          ...fadeUp(),
          content: [
            block('Text', {
              text: '✦  The content platform for fast-moving teams',
              textColor: C.primary,
              textSize: '13px',
              fontWeight: '600',
              bg: C.primary10,
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: C.primary20,
              padding: '6px 16px',
              borderRadius: '999px',
              width: 'fit-content',
            }),
            box('DivBlock', {
              _label: 'Headline',
              align: 'center',
              content: [
                block('Heading', {
                  text: 'Simplify content management.',
                  level: '1',
                  textSize: '54px',
                  fontWeight: '700',
                  lineHeight: '1.04',
                  textColor: C.fg,
                  align: 'center',
                  margin: '0',
                }),
                block('Heading', {
                  text: 'Boost productivity.',
                  level: '1',
                  textSize: '54px',
                  fontWeight: '700',
                  lineHeight: '1.04',
                  textColor: C.primary,
                  align: 'center',
                  margin: '0',
                }),
              ],
            }),
            block('Paragraph', {
              text: 'Model, manage, and publish content from one fast, offline-first workspace — built for teams that move quickly and ship often.',
              textColor: C.muted,
              textSize: '18px',
              lineHeight: '1.6',
              maxWidth: '620px',
              align: 'center',
              margin: '0',
            }),
            box('DivBlock', {
              _label: 'Hero CTAs',
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              content: [
                block('Button', {
                  label: 'Get started free',
                  href: '/register',
                  variant: 'primary',
                }),
                block('Button', { label: 'Book a demo', href: '/login', variant: 'secondary' }),
              ],
            }),
            block('Text', {
              text: 'No credit card required · Free to get started',
              textColor: C.muted,
              textSize: '13px',
            }),
          ],
        }),
        box('DivBlock', {
          _label: 'Hero preview',
          maxWidth: '720px',
          margin: '44px auto 0',
          ...fadeUp('150ms'),
          content: [appPreview(false)],
        }),
      ],
    }),

    // Logos
    box('Section', {
      _label: 'Logos',
      className: 'lp-border-y',
      bg: C.soft,
      padding: '36px 24px',
      content: [
        box('Container', {
          maxWidth: '1100px',
          padding: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          ...fadeUp(),
          content: [
            block('Paragraph', {
              text: "Trusted by the globe's leading innovative teams",
              textColor: C.muted,
              textSize: '13px',
              maxWidth: '190px',
              margin: '0',
            }),
            box('DivBlock', {
              _label: 'Logo row',
              className: 'lp-logos',
              content: ['IPSUM', 'LogoIpsum', 'Acme', 'Northwind', 'Cortex'].map((name) =>
                block('Text', {
                  text: name,
                  textColor: C.muted,
                  textSize: '18px',
                  fontWeight: '600',
                  opacity: '0.6',
                })
              ),
            }),
          ],
        }),
      ],
    }),

    // Features
    box('Section', {
      _label: 'Features',
      htmlId: 'features',
      bg: C.bg,
      padding: '80px 24px',
      content: [
        box('Container', {
          maxWidth: '1100px',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px',
          content: [
            sectionHeading(
              'Features',
              'Unlock premium benefits with advanced features',
              'Everything you need to manage content at scale — designed to be powerful without getting in your way.'
            ),
            box('DivBlock', {
              _label: 'Feature grid',
              className: 'lp-grid-3',
              content: [
                featureCard(
                  ICONS.collections,
                  'Dynamic CMS collections',
                  'Model any content type with custom fields — no migrations, no redeploys. Build collections visually and start publishing in minutes.',
                  '0ms'
                ),
                featureCard(
                  ICONS.shield,
                  'Role-based access control',
                  'Fine-grained permissions per role and resource. Give every teammate exactly the access they need, nothing more.',
                  '90ms'
                ),
                featureCard(
                  ICONS.media,
                  'Built-in media library',
                  'Upload, organize, and reuse images and files across your content with a fast, searchable asset manager.',
                  '180ms'
                ),
                featureCard(
                  ICONS.cloud,
                  'Offline-first by design',
                  'Keep editing when the network drops. Changes queue locally and sync automatically the moment you reconnect.',
                  '0ms'
                ),
                featureCard(
                  ICONS.clock,
                  'Revisions & drafts',
                  'Every change is versioned. Compare, restore, and ship with confidence — your content history is never lost.',
                  '90ms'
                ),
                featureCard(
                  ICONS.apps,
                  'Extensible apps',
                  'Drop a folder, flip a switch. Add features with self-contained apps you can enable or disable at runtime.',
                  '180ms'
                ),
              ],
            }),
          ],
        }),
      ],
    }),

    // Stats
    box('Section', {
      _label: 'Stats',
      htmlId: 'why',
      className: 'lp-border-y',
      bg: C.soft,
      padding: '80px 24px',
      content: [
        box('Container', {
          maxWidth: '1100px',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px',
          content: [
            sectionHeading(
              'Why teams choose Driftless',
              'Trusted to help teams do their best work',
              'Built for performance and reliability, so your content — and your team — never slows down.'
            ),
            box('DivBlock', {
              _label: 'Stat grid',
              className: 'lp-grid-4',
              content: [
                statCard('99.9%', 'Uptime across publishing and APIs', '0ms'),
                statCard('3×', 'Faster content delivery for teams', '90ms'),
                statCard('100%', 'Type-safe from database to UI', '180ms'),
                statCard('10k+', 'Records managed without a sweat', '270ms'),
              ],
            }),
          ],
        }),
      ],
    }),

    // Steps (two-column)
    box('Section', {
      _label: 'Steps',
      bg: C.bg,
      padding: '80px 24px',
      content: [
        box('Container', {
          maxWidth: '1100px',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px',
          content: [
            sectionHeading(
              'Get started',
              'Up and running in 3 easy steps',
              'A guided onboarding experience designed for speed and simplicity.'
            ),
            box('DivBlock', {
              _label: 'Steps layout',
              className: 'lp-steps',
              content: [
                box('DivBlock', {
                  _label: 'Steps list',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  content: [
                    stepCard(
                      '01',
                      'Create your space',
                      'Spin up Driftless, invite your team, and assign roles in a couple of clicks.',
                      '0ms'
                    ),
                    stepCard(
                      '02',
                      'Model your content',
                      'Define collections and fields that match how your team actually works.',
                      '90ms'
                    ),
                    stepCard(
                      '03',
                      'Publish & scale',
                      'Ship content through fast APIs and watch it sync everywhere, online or off.',
                      '180ms'
                    ),
                  ],
                }),
                box('DivBlock', {
                  _label: 'Steps preview panel',
                  backgrounds: STEPS_PANEL_BG,
                  borderRadius: '24px',
                  padding: '24px',
                  ...fadeUp('120ms'),
                  content: [appPreview(true)],
                }),
              ],
            }),
          ],
        }),
      ],
    }),

    // Testimonials
    box('Section', {
      _label: 'Testimonials',
      htmlId: 'testimonials',
      className: 'lp-border-y',
      bg: C.soft,
      padding: '80px 24px',
      content: [
        box('Container', {
          maxWidth: '1100px',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          gap: '48px',
          content: [
            sectionHeading(
              'Success stories',
              'Real results, real impact',
              'Real-world teams shipping more with less friction.'
            ),
            box('DivBlock', {
              _label: 'Testimonial grid',
              className: 'lp-grid-3',
              content: [
                testimonialCard(
                  'Driftless replaced three tools for us. Our editors finally have one place to manage everything, and it just works.',
                  'Hanny Mason',
                  'Head of Content, Northwind',
                  '0ms'
                ),
                testimonialCard(
                  'The offline editing is magic. The team keeps moving on flaky connections and nothing is ever lost.',
                  'Liam Parker',
                  'Product Lead, Cortex',
                  '90ms'
                ),
                testimonialCard(
                  'Permissions and revisions gave us the guardrails we needed to let the whole org contribute safely.',
                  'Emma Collins',
                  'Operations, Brightlane',
                  '180ms'
                ),
              ],
            }),
          ],
        }),
      ],
    }),

    // Final CTA
    box('Section', {
      _label: 'Final CTA',
      bg: C.bg,
      padding: '80px 24px',
      content: [
        box('Container', {
          _label: 'CTA card',
          maxWidth: '900px',
          margin: '0 auto',
          bg: C.primary,
          backgrounds: CTA_BG,
          borderRadius: '24px',
          overflow: 'hidden',
          padding: '64px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          align: 'center',
          ...fadeUp(),
          content: [
            block('Heading', {
              text: 'Ready to simplify your content?',
              level: '2',
              textSize: '34px',
              fontWeight: '700',
              textColor: C.primaryFg,
              align: 'center',
              margin: '0',
            }),
            block('Paragraph', {
              text: 'Join the teams managing content faster with Driftless. Get started in minutes.',
              textColor: C.primaryFg,
              textSize: '16px',
              lineHeight: '1.6',
              maxWidth: '560px',
              align: 'center',
              margin: '0',
              opacity: '0.85',
            }),
            block('Button', { label: 'Get started free', href: '/register', variant: 'secondary' }),
          ],
        }),
      ],
    }),
  ])
}

/**
 * Idempotent, like every other seeder here. On first creation, point the
 * front-page setting at this page — but only when no front page is set yet, so
 * an operator who later chooses a different homepage is never overridden.
 */
export default class extends BaseSeeder {
  async run() {
    const existing = await Page.query().where('path', PAGE_PATH).whereNull('deleted_at').first()
    if (existing) return

    const page = await Page.create({
      id: newUlid(),
      title: 'Home — Landing page',
      path: PAGE_PATH,
      status: 'PUBLISHED',
      renderMode: 'SSR',
      content: pageContent(),
      seo: {
        title: 'Driftless — Simplify content management',
        description:
          'Model, manage, and publish content from one fast, offline-first workspace — built for teams that move quickly and ship often.',
      },
      publishedAt: DateTime.now(),
    })

    const web = new WebSettingsService()
    const sections = await web.getMergedSections()
    const current = sections['home_page']?.['front_page_id']?.trim()
    if (!current) {
      await web.applyPatches([{ section: 'home_page', key: 'front_page_id', value: page.id }])
    }
  }
}

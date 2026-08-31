import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import Page from '#models/page'
import { newUlid } from '#services/ulid_service'
import { WebSettingsService } from '#services/settings_service'

/**
 * The default marketing landing page, as a builder document.
 *
 * A faithful (not pixel-perfect) recreation of the built-in `inertia/pages/home.tsx`
 * as ordinary builder blocks, so the homepage is editable at `/admin/pages` like
 * any other page. On first creation it also points the front-page setting at
 * itself, so `/` renders this page — the built-in static component stays only as
 * the fallback when no front page is set.
 *
 * Idempotent: if a page already lives at this path it is left untouched, so a
 * re-seed never overwrites edits. Colours reference the app theme tokens
 * (`var(--primary)` …) so the page matches the site's palette in `.theme-light`.
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

/** App theme tokens (resolved in the public `.theme-light` scope). */
const C = {
  primary: 'var(--primary)',
  primaryFg: 'var(--primary-foreground)',
  primarySoft: 'color-mix(in oklch, var(--primary) 10%, transparent)',
  fg: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  card: 'var(--card)',
  bg: 'var(--background)',
  soft: 'color-mix(in oklch, var(--muted) 40%, transparent)',
  line: 'var(--border)',
}

const BASE_CSS = `
.lp-flow > div:only-child{display:contents}
.lp-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.lp-grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.lp-card{transition:box-shadow .2s ease}
.lp-card:hover{box-shadow:0 10px 15px -3px rgba(0,0,0,.08),0 4px 6px -4px rgba(0,0,0,.08)}
@media (max-width:900px){.lp-grid-3,.lp-grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.lp-grid-3,.lp-grid-4{grid-template-columns:1fr}}
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

// ── Reusable pieces ──────────────────────────────────────────────────────────

function sectionHeading(eyebrow: string, title: string, subtitle?: string) {
  return box('DivBlock', {
    _label: 'Section heading',
    maxWidth: '640px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    align: 'center',
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
        margin: '0',
      }),
      ...(subtitle
        ? [
            block('Paragraph', {
              text: subtitle,
              textColor: C.muted,
              textSize: '16px',
              lineHeight: '1.6',
              margin: '0',
            }),
          ]
        : []),
    ],
  })
}

function featureCard(title: string, body: string) {
  return box('DivBlock', {
    _label: `Feature — ${title}`,
    className: 'lp-card',
    bg: C.card,
    borderWidth: '1px',
    borderColor: C.line,
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    content: [
      box('DivBlock', {
        _label: 'Icon',
        width: '44px',
        height: '44px',
        borderRadius: '12px',
        bg: C.primarySoft,
        margin: '0 0 6px 0',
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

function statCard(value: string, label: string) {
  return box('DivBlock', {
    _label: `Stat — ${value}`,
    bg: C.card,
    borderWidth: '1px',
    borderColor: C.line,
    borderRadius: '16px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
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

function stepCard(n: string, title: string, body: string) {
  return box('DivBlock', {
    _label: `Step — ${title}`,
    bg: C.card,
    borderWidth: '1px',
    borderColor: C.line,
    borderRadius: '16px',
    padding: '20px',
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-start',
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

// ── Page ─────────────────────────────────────────────────────────────────────

function pageContent() {
  return doc([
    // Hero
    box('Section', {
      _label: 'Hero',
      bg: C.bg,
      padding: '96px 24px 64px',
      content: [
        box('Container', {
          maxWidth: '900px',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          align: 'center',
          content: [
            block('Text', {
              text: 'The content platform for fast-moving teams',
              textColor: C.primary,
              textSize: '13px',
              fontWeight: '600',
              bg: C.primarySoft,
              padding: '6px 14px',
              borderRadius: '999px',
            }),
            box('DivBlock', {
              _label: 'Headline',
              align: 'center',
              content: [
                block('Heading', {
                  text: 'Simplify content management.',
                  level: '1',
                  textSize: '52px',
                  fontWeight: '700',
                  lineHeight: '1.05',
                  textColor: C.fg,
                  align: 'center',
                  margin: '0',
                }),
                block('Heading', {
                  text: 'Boost productivity.',
                  level: '1',
                  textSize: '52px',
                  fontWeight: '700',
                  lineHeight: '1.05',
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
                block('Button', { label: 'Get started free', href: '/register', variant: 'primary' }),
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
      ],
    }),

    // Features
    box('Section', {
      _label: 'Features',
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
                  'Dynamic CMS collections',
                  'Model any content type with custom fields — no migrations, no redeploys. Build collections visually and start publishing in minutes.'
                ),
                featureCard(
                  'Role-based access control',
                  'Fine-grained permissions per role and resource. Give every teammate exactly the access they need, nothing more.'
                ),
                featureCard(
                  'Built-in media library',
                  'Upload, organize, and reuse images and files across your content with a fast, searchable asset manager.'
                ),
                featureCard(
                  'Offline-first by design',
                  'Keep editing when the network drops. Changes queue locally and sync automatically the moment you reconnect.'
                ),
                featureCard(
                  'Revisions & drafts',
                  'Every change is versioned. Compare, restore, and ship with confidence — your content history is never lost.'
                ),
                featureCard(
                  'Extensible apps',
                  'Drop a folder, flip a switch. Add features with self-contained apps you can enable or disable at runtime.'
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
                statCard('99.9%', 'Uptime across publishing and APIs'),
                statCard('3×', 'Faster content delivery for teams'),
                statCard('100%', 'Type-safe from database to UI'),
                statCard('10k+', 'Records managed without a sweat'),
              ],
            }),
          ],
        }),
      ],
    }),

    // Steps
    box('Section', {
      _label: 'Steps',
      bg: C.bg,
      padding: '80px 24px',
      content: [
        box('Container', {
          maxWidth: '760px',
          padding: '0',
          display: 'flex',
          flexDirection: 'column',
          gap: '40px',
          content: [
            sectionHeading(
              'Get started',
              'Up and running in 3 easy steps',
              'A guided onboarding experience designed for speed and simplicity.'
            ),
            box('DivBlock', {
              _label: 'Steps list',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              content: [
                stepCard(
                  '01',
                  'Create your space',
                  'Spin up Driftless, invite your team, and assign roles in a couple of clicks.'
                ),
                stepCard(
                  '02',
                  'Model your content',
                  'Define collections and fields that match how your team actually works.'
                ),
                stepCard(
                  '03',
                  'Publish & scale',
                  'Ship content through fast APIs and watch it sync everywhere, online or off.'
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
      padding: '80px 24px',
      content: [
        box('Container', {
          maxWidth: '900px',
          margin: '0 auto',
          bg: C.primary,
          borderRadius: '24px',
          padding: '64px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          align: 'center',
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

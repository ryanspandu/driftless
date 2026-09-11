import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Template from '#models/template'
import { newUlid } from '#services/ulid_service'

/**
 * Starter SECTION PRESETS — known-good, token-driven sections stored as COMPONENT
 * templates. The MCP `list_section_presets` lists them and `insert_section` clones
 * one into a page (fresh ids) so the AI fills it with real content instead of
 * composing every block from scratch. This is the Flowkit/Shopify-sections idea:
 * lower variance → higher fidelity.
 *
 * They are authored entirely with design TOKENS (var(--space-*), var(--text-*),
 * var(--radius-*), var(--color-*), var(--primary)) so an inserted section inherits
 * whatever the site's set_appearance theme is. Image slots ship with an empty src
 * on purpose — the AI replaces them with the design's real assets (an empty Image
 * is a non-blocking validator warning, i.e. a "fill me" marker).
 *
 * Idempotent: fixed ids, created only if missing, so a re-seed never duplicates
 * them and never clobbers an operator's edits to a preset. Add more presets by
 * appending to PRESETS.
 */

/** Puck needs an id on every block; insert_section re-ids them on clone anyway. */
function b(type: string, props: Record<string, unknown> = {}) {
  return { type, props: { id: `${type}-${newUlid().toLowerCase().slice(-10)}`, ...props } }
}
const doc = (...content: ReturnType<typeof b>[]) => ({ root: { props: {} }, content })

/** Split hero: headline + copy + two CTAs on the left, an image on the right. */
function splitHero() {
  return doc(
    b('Section', {
      padding: 'var(--space-4xl) 0',
      content: [
        b('Container', {
          maxWidth: 'var(--container-xl)',
          margin: '0 auto',
          padding: '0 var(--space-lg)',
          content: [
            b('HFlex', {
              display: 'flex',
              flexDirection: 'row',
              gap: 'var(--space-2xl)',
              alignItems: 'center',
              content: [
                b('VFlex', {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-lg)',
                  width: '55%',
                  content: [
                    b('Heading', {
                      text: 'A headline that sells the product',
                      level: '1',
                      textSize: 'var(--text-5xl)',
                      fontWeight: '700',
                      lineHeight: '1.1',
                    }),
                    b('Paragraph', {
                      text: 'One or two supporting sentences that explain the value and invite the visitor to act.',
                      textSize: 'var(--text-lg)',
                      lineHeight: '1.6',
                    }),
                    b('HFlex', {
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 'var(--space-md)',
                      content: [
                        b('Button', { label: 'Get started', href: '#', variant: 'primary' }),
                        b('Button', { label: 'Learn more', href: '#', variant: 'outline' }),
                      ],
                    }),
                  ],
                }),
                b('Image', { src: '', alt: '', width: '45%', borderRadius: 'var(--radius-lg)' }),
              ],
            }),
          ],
        }),
      ],
    })
  )
}

/** Three equal feature cards under a centered heading. */
function featureGrid() {
  const card = (icon: string, title: string) =>
    b('DivBlock', {
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      padding: 'var(--space-lg)',
      borderRadius: 'var(--radius-lg)',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'var(--border)',
      content: [
        b('Icon', { name: icon, size: '28px', textColor: 'var(--primary)' }),
        b('Heading', { text: title, level: '3', textSize: 'var(--text-xl)', fontWeight: '600' }),
        b('Paragraph', {
          text: 'A short line describing this feature and why it matters.',
          textSize: 'var(--text-base)',
          lineHeight: '1.6',
        }),
      ],
    })
  return doc(
    b('Section', {
      padding: 'var(--space-4xl) 0',
      content: [
        b('Container', {
          maxWidth: 'var(--container-xl)',
          margin: '0 auto',
          padding: '0 var(--space-lg)',
          content: [
            b('VFlex', {
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2xl)',
              content: [
                b('VFlex', {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-sm)',
                  alignItems: 'center',
                  content: [
                    b('Heading', {
                      text: 'Everything you need',
                      level: '2',
                      textSize: 'var(--text-3xl)',
                      fontWeight: '700',
                      align: 'center',
                    }),
                    b('Paragraph', {
                      text: 'A one-line summary of the section.',
                      textSize: 'var(--text-lg)',
                      align: 'center',
                    }),
                  ],
                }),
                b('Grid', {
                  display: 'grid',
                  columns: '3',
                  gap: 'var(--space-lg)',
                  content: [
                    card('zap', 'Fast'),
                    card('shield-check', 'Secure'),
                    card('sparkles', 'Delightful'),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  )
}

/** Full-width call-to-action band on the brand colour. */
function ctaBand() {
  return doc(
    b('Section', {
      bg: 'var(--primary)',
      padding: 'var(--space-4xl) 0',
      content: [
        b('Container', {
          maxWidth: 'var(--container-lg)',
          margin: '0 auto',
          padding: '0 var(--space-lg)',
          content: [
            b('VFlex', {
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-lg)',
              alignItems: 'center',
              content: [
                b('Heading', {
                  text: 'Ready to get started?',
                  level: '2',
                  textSize: 'var(--text-4xl)',
                  fontWeight: '700',
                  textColor: '#ffffff',
                  align: 'center',
                }),
                b('Paragraph', {
                  text: 'One short line of persuasion before the button.',
                  textSize: 'var(--text-lg)',
                  textColor: 'rgba(255,255,255,0.85)',
                  align: 'center',
                }),
                b('Button', {
                  label: 'Get started',
                  href: '#',
                  variant: 'custom',
                  bg: '#ffffff',
                  textColor: 'var(--primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-sm) var(--space-lg)',
                }),
              ],
            }),
          ],
        }),
      ],
    })
  )
}

/**
 * Band header row: a big title on the LEFT with a short supporting line + a CTA
 * on the RIGHT, TOP-aligned. The common heading of a bestsellers / gallery /
 * "find your space" band. `alignItems:"flex-start"` is deliberate — it top-aligns
 * the heading with the top of the right column; `flex-end` (the mistake this
 * preset exists to prevent) drops the heading to the bottom and misaligns it.
 * For a header whose title is CENTRED over the band instead, use a single
 * Heading(align:"center") rather than this split.
 */
function sectionHeader() {
  return doc(
    b('Section', {
      padding: 'var(--space-3xl) 0 var(--space-xl)',
      content: [
        b('Container', {
          maxWidth: 'var(--container-xl)',
          margin: '0 auto',
          padding: '0 var(--space-lg)',
          content: [
            b('HFlex', {
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 'var(--space-lg)',
              content: [
                b('Heading', {
                  text: 'Section title',
                  level: '2',
                  textSize: 'var(--text-4xl)',
                  fontWeight: '600',
                  align: 'left',
                }),
                b('VFlex', {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 'var(--space-sm)',
                  content: [
                    b('Paragraph', {
                      text: 'One or two supporting lines that introduce the section.',
                      textSize: 'var(--text-base)',
                      textColor: 'var(--color-ink)',
                      align: 'right',
                      maxWidth: '360px',
                    }),
                    b('Button', {
                      label: 'View all →',
                      href: '#',
                      variant: 'outline',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-sm) var(--space-lg)',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  )
}

const PRESETS: Array<{ id: string; name: string; content: () => Record<string, unknown> }> = [
  { id: 'seedsec-hero-split', name: 'Section — Split hero', content: splitHero },
  { id: 'seedsec-feature-grid', name: 'Section — Feature grid (3)', content: featureGrid },
  { id: 'seedsec-cta-band', name: 'Section — CTA band', content: ctaBand },
  { id: 'seedsec-header', name: 'Section — Header', content: sectionHeader },
]

export default class extends BaseSeeder {
  async run() {
    for (const preset of PRESETS) {
      await Template.firstOrCreate(
        { id: preset.id },
        {
          name: preset.name,
          type: 'COMPONENT',
          content: preset.content(),
          isDefault: false,
          collectionKey: null,
        }
      )
    }
  }
}

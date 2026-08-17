import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import Page from '#models/page'
import Template from '#models/template'
import { newUlid } from '#services/ulid_service'

/**
 * The Static Bloom landing page, as a builder document.
 *
 * Written as ordinary blocks rather than a bespoke React page, so everything
 * here is editable at `/admin/pages` — the same document a person would have
 * assembled by hand in the builder. Nothing is special-cased.
 *
 * Images are deliberately left empty (`src: ''`). Each one renders the builder's
 * "No image URL" placeholder sized to its slot, so the layout holds while the
 * operator picks the real asset from the media library. `alt` describes what
 * belongs in each slot.
 */

/** Puck needs an id on every block; it is not derived from position. */
function block(type: string, props: Record<string, unknown> = {}) {
  return { type, props: { id: `${type}-${newUlid().toLowerCase().slice(-10)}`, ...props } }
}

/**
 * A container block, tagged so its slot wrapper can be neutralised.
 *
 * Puck renders every slot's children inside an **unstyled `<div>` of its own**,
 * which sits between a container and its contents. Left alone, a container's
 * `display: flex` / `display: grid` lays out that one wrapper rather than the
 * children — four product cards stack in a single column, and a percentage
 * height resolves against a box nobody authored. `sb-flow` pairs with the
 * `display: contents` rule in {@link BASE_CSS} to make the wrapper transparent,
 * so the layout an operator sets in the Element panel is the layout they get.
 */
function box(type: string, props: Record<string, unknown> = {}) {
  const className = ['sb-flow', props.className].filter(Boolean).join(' ')
  return block(type, { ...props, className })
}

/**
 * The palette, in one place.
 *
 * Values live on the blocks as plain CSS strings rather than design tokens
 * because that is what the Element panel reads and writes — an operator
 * recolouring a section in the builder should see the change stick.
 */
const C = {
  green: '#343F21',
  greenDeep: '#2B341C',
  ink: '#171715',
  body: '#5F5F58',
  muted: '#8A8A82',
  cream: '#F6F4EF',
  tile: '#F1F0EB',
  line: '#E4E2DB',
  white: '#FFFFFF',
  sale: '#A6392A',
  onGreen: '#F7F5EE',
  onGreenMuted: '#C4C9B4',
}

/**
 * Rules that inline style props cannot express.
 *
 * Everything an operator would plausibly want to tweak — colour, spacing, size —
 * stays a block prop so the Element panel can edit it. This file is only for
 * what props genuinely cannot do: breakpoints, hover, `::after`, and normalising
 * the two shapes an Image block renders (a real `<img>` or its empty
 * placeholder) into "fill the parent" so a page with no assets yet still lays
 * out correctly.
 *
 * Each document carries its own copy because header, page and footer are three
 * separate `<Render>` trees — a header used on some other page has to bring its
 * own styling with it.
 */
const BASE_CSS = `
.sb-flow>div:only-child{display:contents}
.sb-btn a{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:999px;padding:11px 21px;font-size:13px;font-weight:600;letter-spacing:.01em;text-decoration:none;background:none;color:inherit;transition:background-color .18s ease,border-color .18s ease,color .18s ease}
.sb-btn-primary a{background:${C.green};color:${C.onGreen}}
.sb-btn-primary a:hover{background:${C.greenDeep}}
.sb-btn-light a{background:${C.white};color:${C.ink};border:1px solid rgba(0,0,0,.10)}
.sb-btn-light a:hover{background:#F4F2ED}
.sb-btn-outline a{background:${C.white};color:${C.ink};border:1px solid ${C.line};padding:9px 17px;font-size:12px}
.sb-btn-outline a:hover{border-color:#B9B5A9}
.sb-btn-sm a{padding:9px 18px;font-size:12.5px}
.sb-btn-block a{display:flex;width:100%}
.sb-img{display:block;width:100%;height:100%}
.sb-img>img{display:block;width:100%;height:100%;max-width:none;object-fit:cover}
/* The "No image URL" placeholder, tinted here so no wrapper needs an opaque fill of its own. */
.sb-img>div{height:100%!important;min-height:100%!important;background:${C.tile}}
`.trim()

const PAGE_CSS = `
${BASE_CSS}
.sb-grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:22px}
.sb-grid-5{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.sb-sec-head{display:flex;justify-content:space-between;align-items:flex-end;gap:36px}
.sb-faq{display:grid;grid-template-columns:.85fr 1.15fr;gap:56px}
.sb-features{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.sb-rail{display:flex;gap:16px;overflow-x:auto;scrollbar-width:none}
.sb-rail::-webkit-scrollbar{display:none}
.sb-ico .sb-img>div{font-size:0}
.sb-space::after{content:'';position:absolute;inset:0;z-index:1;background:linear-gradient(to top,rgba(0,0,0,.5),transparent 55%)}
.sb-acc details{border-bottom:1px solid ${C.line};padding:15px 0}
.sb-acc details:first-child{padding-top:0}
.sb-acc summary{display:flex;justify-content:space-between;align-items:center;gap:16px;list-style:none;cursor:pointer;font-size:13.5px;font-weight:500;color:${C.ink}}
.sb-acc summary::-webkit-details-marker{display:none}
.sb-acc summary::after{content:'+';font-size:17px;line-height:1;color:${C.muted}}
.sb-acc details[open] summary::after{content:'\\2013'}
.sb-acc p{margin:12px 0 0;max-width:62ch;font-size:12.5px;line-height:1.75;color:${C.body}}
@media (max-width:1024px){
.sb-grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}
.sb-grid-5{grid-template-columns:repeat(3,minmax(0,1fr))}
.sb-features{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:22px}
.sb-faq{grid-template-columns:1fr;gap:30px}
}
@media (max-width:640px){
.sb-grid-4{grid-template-columns:1fr}
.sb-grid-5{grid-template-columns:repeat(2,minmax(0,1fr))}
.sb-features{grid-template-columns:1fr}
.sb-sec-head{flex-direction:column;align-items:flex-start}
/* Hung off the diagram's right edge on desktop; there is no room for that on a phone. */
.sb-callout{position:static!important;width:auto!important;margin:16px 0 0 0!important}
}
`.trim()

const HEADER_CSS = `
${BASE_CSS}
.sb-header{border-bottom:1px solid #ECEAE3}
.sb-nav a{font-size:13px;color:#3A3A34;text-decoration:none}
.sb-nav a:hover{color:${C.ink}}
/**
 * !important because the nav's own display lives in a block prop, and an inline
 * style beats a stylesheet rule. Every breakpoint rule that has to override a
 * value set in the Element panel needs this.
 */
@media (max-width:820px){.sb-nav{display:none!important}}
`.trim()

const FOOTER_CSS = `
${BASE_CSS}
.sb-foot-grid{display:grid;grid-template-columns:1.7fr 1fr 1fr 1fr;gap:40px}
.sb-foot-grid a{font-size:12.5px;color:${C.onGreenMuted};text-decoration:none}
.sb-foot-grid a:hover{color:${C.onGreen}}
.sb-foot-bar{border-top:1px solid rgba(255,255,255,.13)}
@media (max-width:820px){.sb-foot-grid{grid-template-columns:1fr 1fr;gap:30px}}
@media (max-width:560px){.sb-foot-grid{grid-template-columns:1fr}.sb-foot-bar{flex-direction:column;gap:8px}}
`.trim()

/** Wrap a block tree as a Puck document, with its stylesheet on the root. */
function doc(content: unknown[], css: string, snippetId: string) {
  return {
    root: {
      props: {
        codeSnippets: [
          { id: snippetId, name: 'Static Bloom styles', lang: 'css', code: css, enabled: true },
        ],
      },
    },
    zones: {},
    content,
  }
}

/** An image slot that fills its parent, whether or not an asset is chosen yet. */
function image(alt: string) {
  return block('Image', { src: '', alt, className: 'sb-img' })
}

// ── Header ─────────────────────────────────────────────────────────────────

function navLink(text: string, href: string) {
  return block('TextLink', { text, href, newTab: 'false', textDecoration: 'none' })
}

function headerContent() {
  return doc(
    [
      box('Section', {
        _label: 'Site header',
        className: 'sb-header',
        bg: C.white,
        padding: '16px 24px',
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
                href: '/staticbloom',
                newTab: 'false',
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                textDecoration: 'none',
                content: [
                  /**
                   * Drawn rather than uploaded. A logo left as an empty image
                   * slot puts a dashed placeholder in the most prominent spot
                   * on every page — swap this for an Image block once there is
                   * a real mark.
                   */
                  box('DivBlock', {
                    _label: 'Logo mark',
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    bg: C.green,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    content: [
                      block('Text', {
                        text: 'B',
                        textColor: C.onGreen,
                        textSize: '15px',
                        fontWeight: '700',
                        lineHeight: '1',
                      }),
                    ],
                  }),
                ],
              }),

              box('DivBlock', {
                _label: 'Nav',
                className: 'sb-nav',
                display: 'flex',
                alignItems: 'center',
                gap: '26px',
                content: [
                  navLink('Products ⌄', '#bestsellers'),
                  navLink('Contact Us', '#faq'),
                  navLink('Gallery', '#gallery'),
                  navLink('Plan your Model', '#how-it-works'),
                ],
              }),

              block('Button', {
                _label: 'Header CTA',
                label: 'Shop the System',
                href: '#bestsellers',
                variant: 'primary',
                className: 'sb-btn sb-btn-primary sb-btn-sm',
              }),
            ],
          }),
        ],
      }),
    ],
    HEADER_CSS,
    'sb-header-css'
  )
}

// ── Footer ─────────────────────────────────────────────────────────────────

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
        textColor: C.onGreen,
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
        bg: C.green,
        textColor: C.onGreenMuted,
        padding: '54px 24px 0 24px',
        content: [
          box('Container', {
            maxWidth: '1200px',
            padding: '0',
            content: [
              box('DivBlock', {
                _label: 'Footer columns',
                className: 'sb-foot-grid',
                content: [
                  box('DivBlock', {
                    _label: 'Footer — brand',
                    maxWidth: '300px',
                    margin: '0',
                    content: [
                      block('Heading', {
                        text: 'Static Bloom',
                        level: '3',
                        textSize: '17px',
                        fontWeight: '600',
                        textColor: C.onGreen,
                        margin: '0 0 12px 0',
                      }),
                      block('Text', {
                        text: "An independent guide to modular living systems. We're an affiliate partner — not the seller of record — and link out to trusted retailers.",
                        textSize: '12px',
                        lineHeight: '1.75',
                        textColor: C.onGreenMuted,
                      }),
                    ],
                  }),
                  footerColumn('Shop', [
                    { text: 'Bestsellers', href: '#bestsellers' },
                    { text: 'The System', href: '#how-it-works' },
                    { text: 'Gallery', href: '#gallery' },
                  ]),
                  footerColumn('Info', [
                    { text: 'FAQ', href: '#faq' },
                    { text: 'Reviews', href: '#reviews' },
                    { text: 'Affiliate Disclosure', href: '#' },
                  ]),
                  footerColumn('Contact', [
                    { text: 'Get in Touch', href: '#faq' },
                    { text: 'About Static Bloom', href: '#' },
                  ]),
                ],
              }),

              box('DivBlock', {
                _label: 'Footer baseline',
                className: 'sb-foot-bar',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                margin: '44px 0 0 0',
                padding: '20px 0',
                content: [
                  block('Text', {
                    text: '© 2026 Static Bloom. All rights reserved.',
                    textSize: '11.5px',
                    textColor: C.onGreenMuted,
                  }),
                  block('Text', {
                    text: 'Product imagery courtesy of our brand partners.',
                    textSize: '11.5px',
                    textColor: C.onGreenMuted,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
    FOOTER_CSS,
    'sb-footer-css'
  )
}

// ── Page sections ──────────────────────────────────────────────────────────

function hero() {
  return box('Section', {
    _label: 'Hero',
    padding: '0',
    bg: C.cream,
    content: [
      box('DivBlock', {
        _label: 'Hero canvas',
        position: 'relative',
        minHeight: '620px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-end',
        content: [
          /**
           * Left transparent on purpose.
           *
           * This div only exists to stretch the hero photo across the canvas. A
           * fill of its own would be an opaque sheet over the whole hero, and
           * the section behind it can carry a background too — so the moment
           * someone sets one there, this would hide it with no clue as to what
           * was covering it. The empty-state tint belongs to the image slot.
           */
          box('DivBlock', {
            _label: 'Hero image',
            position: 'absolute',
            top: '0',
            right: '0',
            bottom: '0',
            left: '0',
            content: [image('Hero — sage green sideboard styled against a living room wall')],
          }),

          /**
           * A scrim, as a background layer rather than a flat colour.
           *
           * The headline is near-black and sits over a photograph nobody has
           * uploaded yet, so it has to stay readable whatever lands behind it.
           * A left-to-right fade to the page's own cream does that without
           * dimming the product, which is also how the reference treats it.
           * Edit it under Backgrounds → Image & gradient.
           */
          box('DivBlock', {
            _label: 'Hero scrim',
            position: 'absolute',
            top: '0',
            right: '0',
            bottom: '0',
            left: '0',
            zIndex: '1',
            backgrounds: [
              {
                id: 'sb-hero-scrim',
                type: 'linear',
                angle: '90',
                stops: [
                  { color: 'rgba(246, 244, 239, 0.94)', pos: '0%' },
                  { color: 'rgba(246, 244, 239, 0)', pos: '58%' },
                ],
              },
            ],
          }),

          /**
           * The card rides a container of its own rather than being offset from
           * the viewport edge, so its left edge lands on the same line as the
           * headline below it at every width. `left: 0` + `right: 0` + a max
           * width is what lets the auto margins centre an absolutely positioned
           * box, which is how it stays aligned once the viewport is narrower
           * than the container.
           */
          box('Container', {
            _label: 'Hero top rail',
            position: 'absolute',
            top: '26px',
            left: '0',
            right: '0',
            zIndex: '3',
            maxWidth: '1200px',
            padding: '0 24px',
            content: [
              box('DivBlock', {
                _label: 'Video card',
                width: '208px',
                bg: C.white,
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: 'lg',
                content: [
                  box('DivBlock', {
                    height: '116px',
                    bg: C.tile,
                    content: [image('Video thumbnail — a room being reconfigured')],
                  }),
                  box('DivBlock', {
                    padding: '9px 11px',
                    content: [
                      block('Text', {
                        text: '▶  Play video: how it works',
                        textSize: '10.5px',
                        fontWeight: '600',
                        textColor: C.ink,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),

          box('Container', {
            _label: 'Hero copy',
            position: 'relative',
            zIndex: '2',
            /**
             * Explicit, because this is a flex item of the hero canvas: left to
             * size itself it shrinks to its content and the auto margins then
             * centre the copy instead of anchoring it to the left edge.
             */
            width: '100%',
            maxWidth: '1200px',
            padding: '0 24px 62px 24px',
            content: [
              box('DivBlock', {
                maxWidth: '470px',
                margin: '0',
                content: [
                  block('Heading', {
                    text: 'Built to reconfigure.\nMade to last.',
                    level: '1',
                    textSize: '43px',
                    lineHeight: '1.1',
                    fontWeight: '600',
                    whiteSpace: 'pre-line',
                    textColor: C.ink,
                    margin: '0 0 16px 0',
                  }),
                  block('Paragraph', {
                    text: 'Ball-joint modular shelving, sideboards, and storage — mix colors, expand pieces, and redesign your space without buying new furniture.',
                    textSize: '13px',
                    lineHeight: '1.75',
                    textColor: '#3D3D37',
                    maxWidth: '360px',
                    margin: '0 0 26px 0',
                  }),
                  box('DivBlock', {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '11px',
                    content: [
                      block('Button', {
                        label: 'Shop the System →',
                        href: '#bestsellers',
                        variant: 'primary',
                        className: 'sb-btn sb-btn-primary',
                      }),
                      block('Button', {
                        label: 'Plan your Model',
                        href: '#how-it-works',
                        variant: 'secondary',
                        className: 'sb-btn sb-btn-light',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

function featureItem(title: string, copy: string) {
  return box('DivBlock', {
    _label: `Feature — ${title}`,
    padding: '4px 24px',
    content: [
      box('DivBlock', {
        className: 'sb-ico',
        width: '30px',
        height: '30px',
        borderRadius: '8px',
        overflow: 'hidden',
        bg: C.tile,
        margin: '0 0 12px 0',
        content: [image(`${title} icon`)],
      }),
      block('Heading', {
        text: title,
        level: '4',
        textSize: '14px',
        fontWeight: '600',
        textColor: C.ink,
        margin: '0 0 5px 0',
      }),
      block('Text', {
        text: copy,
        textSize: '11.5px',
        lineHeight: '1.6',
        textColor: C.body,
      }),
    ],
  })
}

function featureBar() {
  return box('Section', {
    _label: 'Feature bar',
    padding: '0 24px',
    /**
     * Lifted over the hero rather than sitting under it, which is what makes
     * the card read as one composition with the image behind it.
     */
    margin: '-58px 0 0 0',
    position: 'relative',
    zIndex: '3',
    content: [
      box('Container', {
        maxWidth: '1200px',
        padding: '0',
        content: [
          box('DivBlock', {
            className: 'sb-features',
            bg: C.white,
            borderRadius: '14px',
            boxShadow: 'lg',
            padding: '26px 4px',
            content: [
              featureItem('15 Colors', 'Mix and match across every piece'),
              featureItem('Fully Modular', 'Add, remove, or reconfigure anytime'),
              featureItem('Free Shipping', 'On every order, no minimum'),
              featureItem('Built to Last', 'Steel frame, chrome joints, lifetime configurability'),
            ],
          }),
        ],
      }),
    ],
  })
}

function sectionHead(options: {
  title: string
  copy: string
  cta: string
  href: string
  margin?: string
}) {
  return box('DivBlock', {
    _label: 'Section head',
    className: 'sb-sec-head',
    margin: options.margin ?? '0 0 34px 0',
    content: [
      block('Heading', {
        text: options.title,
        level: '2',
        textSize: '29px',
        fontWeight: '600',
        textColor: C.ink,
      }),
      box('DivBlock', {
        maxWidth: '330px',
        content: [
          block('Text', {
            text: options.copy,
            textSize: '11.5px',
            lineHeight: '1.7',
            textColor: C.body,
            margin: '0 0 12px 0',
          }),
          block('Button', {
            label: options.cta,
            href: options.href,
            variant: 'outline',
            className: 'sb-btn sb-btn-outline',
          }),
        ],
      }),
    ],
  })
}

function productCard(p: { name: string; was: string; now: string; swatches: string[] }) {
  return box('DivBlock', {
    _label: `Product — ${p.name}`,
    content: [
      box('DivBlock', {
        height: '190px',
        bg: C.tile,
        borderRadius: '10px',
        overflow: 'hidden',
        content: [image(`${p.name} — product photo`)],
      }),
      block('Heading', {
        text: p.name,
        level: '3',
        textSize: '14px',
        fontWeight: '600',
        align: 'center',
        textColor: C.ink,
        margin: '15px 0 7px 0',
      }),
      box('DivBlock', {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'baseline',
        gap: '7px',
        content: [
          block('Text', {
            text: p.was,
            textSize: '12px',
            textColor: C.muted,
            textDecoration: 'line-through',
          }),
          block('Text', {
            text: p.now,
            textSize: '13.5px',
            fontWeight: '700',
            textColor: C.sale,
          }),
        ],
      }),
      box('DivBlock', {
        _label: 'Swatches',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '6px',
        margin: '11px 0 13px 0',
        content: [
          ...p.swatches.map((hex) =>
            box('DivBlock', {
              width: '13px',
              height: '13px',
              borderRadius: '999px',
              bg: hex,
            })
          ),
          block('Text', { text: '+', textSize: '11px', textColor: C.muted }),
        ],
      }),
      block('Button', {
        label: 'Shop Now →',
        href: '#',
        variant: 'outline',
        className: 'sb-btn sb-btn-outline sb-btn-block',
      }),
    ],
  })
}

const PRODUCTS = [
  {
    name: 'E2 Sideboard',
    was: '$3,198',
    now: '$1,599',
    swatches: ['#1D4E9C', '#C8A579', '#1F2937', '#E0A72B'],
  },
  {
    name: 'F2 Credenza',
    was: '$2,998',
    now: '$1,499',
    swatches: ['#6B7B4A', '#C8A579', '#1D4E9C', '#E0A72B'],
  },
  {
    name: 'R1 Shelving',
    was: '$4,928',
    now: '$2,199',
    swatches: ['#9B2321', '#C8A579', '#1D4E9C', '#E0A72B'],
  },
  {
    name: 'M64 Credenza',
    was: '$3,198',
    now: '$1,599',
    swatches: ['#E0A72B', '#C8A579', '#1D4E9C', '#1F2937'],
  },
  {
    name: 'W3 Media Unit',
    was: '$3,448',
    now: '$1,724',
    swatches: ['#7A4B2A', '#C8A579', '#1D4E9C', '#E0A72B'],
  },
  {
    name: 'G4 Plant Shelf',
    was: '$2,760',
    now: '$1,380',
    swatches: ['#9AA6A0', '#6B7B4A', '#1F2937', '#E0A72B'],
  },
  {
    name: 'L2 Open Rack',
    was: '$3,890',
    now: '$1,945',
    swatches: ['#D9D9D4', '#1D4E9C', '#9B2321', '#E0A72B'],
  },
  {
    name: 'A1 Desk Unit',
    was: '$3,198',
    now: '$1,599',
    swatches: ['#2E4159', '#C8A579', '#1D4E9C', '#E0A72B'],
  },
]

function bestsellers() {
  return box('Section', {
    _label: 'Bestsellers',
    className: 'sb-anchor',
    bg: C.white,
    padding: '74px 24px',
    content: [
      box('Container', {
        maxWidth: '1200px',
        padding: '0',
        content: [
          sectionHead({
            title: 'Our Bestsellers',
            copy: 'Eight configurations, chosen for how well they adapt to different rooms and layouts.',
            cta: 'View All Products →',
            href: '#',
          }),
          box('DivBlock', {
            _label: 'Product grid',
            className: 'sb-grid-4',
            content: PRODUCTS.map(productCard),
          }),
        ],
      }),
    ],
  })
}

function hotspot(top: string, left: string) {
  return box('DivBlock', {
    _label: 'Hotspot',
    position: 'absolute',
    top,
    left,
    zIndex: '2',
    width: '22px',
    height: '22px',
    borderRadius: '999px',
    bg: 'rgba(255,255,255,.88)',
    boxShadow: 'sm',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    content: [block('Text', { text: '+', textSize: '13px', fontWeight: '600', textColor: C.ink })],
  })
}

function howItWorks() {
  return box('Section', {
    _label: 'How the system works',
    bg: C.green,
    textColor: C.onGreen,
    padding: '76px 24px 88px 24px',
    content: [
      box('Container', {
        maxWidth: '1000px',
        padding: '0',
        align: 'center',
        content: [
          block('Heading', {
            text: 'How the System Works',
            level: '2',
            textSize: '27px',
            fontWeight: '600',
            textColor: C.onGreen,
          }),
          block('Text', {
            text: 'Six design decisions that let one system adapt to almost any room.',
            textSize: '12px',
            textColor: C.onGreenMuted,
            margin: '11px 0 46px 0',
          }),
          box('DivBlock', {
            _label: 'Diagram',
            position: 'relative',
            maxWidth: '700px',
            margin: '0 auto',
            content: [
              box('DivBlock', {
                height: '300px',
                borderRadius: '10px',
                overflow: 'hidden',
                bg: 'rgba(255,255,255,.06)',
                content: [image('Yellow modular sideboard, front view, with callout points')],
              }),
              hotspot('44%', '2%'),
              hotspot('30%', '46%'),
              hotspot('72%', '38%'),
              box('DivBlock', {
                _label: 'Callout — Durable Hinges',
                className: 'sb-callout',
                position: 'absolute',
                top: '14px',
                right: '-40px',
                zIndex: '3',
                width: '186px',
                bg: C.white,
                borderRadius: '10px',
                overflow: 'hidden',
                boxShadow: 'lg',
                align: 'left',
                content: [
                  box('DivBlock', {
                    height: '84px',
                    bg: C.tile,
                    content: [image('Close-up of the hinge mechanism')],
                  }),
                  box('DivBlock', {
                    padding: '11px 12px 13px 12px',
                    content: [
                      block('Heading', {
                        text: 'Durable Hinges',
                        level: '4',
                        textSize: '13px',
                        fontWeight: '600',
                        textColor: C.ink,
                        margin: '0 0 5px 0',
                      }),
                      block('Text', {
                        text: 'Smooth, hidden hinges offer strength and clean access without visual clutter.',
                        textSize: '10.5px',
                        lineHeight: '1.6',
                        textColor: C.body,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

function styledTile(label: string) {
  return box('DivBlock', {
    _label: `Tile — ${label}`,
    position: 'relative',
    height: '210px',
    borderRadius: '6px',
    overflow: 'hidden',
    bg: '#2B241C',
    content: [
      image(`${label.toLowerCase()} styling photo`),
      block('Text', {
        text: label,
        position: 'absolute',
        top: '11px',
        left: '11px',
        zIndex: '2',
        textSize: '9px',
        fontWeight: '600',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        textColor: 'rgba(255,255,255,.92)',
      }),
    ],
  })
}

function seeItStyled() {
  return box('Section', {
    _label: 'See it styled',
    bg: C.white,
    padding: '70px 24px',
    content: [
      box('Container', {
        maxWidth: '1200px',
        padding: '0',
        content: [
          block('Heading', {
            text: 'See it styled',
            level: '2',
            textSize: '29px',
            fontWeight: '600',
            align: 'center',
            textColor: C.ink,
            margin: '0 0 30px 0',
          }),
          box('DivBlock', {
            className: 'sb-grid-5',
            content: ['Sideboard', 'Shelving', 'Media console', 'Bedroom', 'Room tour'].map(
              styledTile
            ),
          }),
        ],
      }),
    ],
  })
}

function testimonial(t: { quote: string; author: string }) {
  return box('DivBlock', {
    _label: `Review — ${t.author}`,
    width: '262px',
    flexShrink: '0',
    bg: C.white,
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.line,
    padding: '17px 18px 19px 18px',
    content: [
      block('Text', { text: '★★★★★', textSize: '11px', textColor: '#E0A43B' }),
      block('Text', {
        text: t.quote,
        textSize: '11.5px',
        lineHeight: '1.75',
        textColor: C.body,
        margin: '10px 0 14px 0',
      }),
      block('Text', {
        text: t.author,
        textSize: '11.5px',
        fontWeight: '600',
        textColor: C.ink,
      }),
    ],
  })
}

const REVIEWS = [
  {
    quote:
      'I moved into a new office and wanted something different for my desk setup, so I went with a shelving unit and combined multiple colors. Glad I did — the final result never feels like too much.',
    author: 'Marcus T.',
  },
  {
    quote:
      'I went with a custom C13 media setup and added a yellow panel in the middle just to try something a little different. It turned out even better than I expected. The yellow adds a really nice pop of color without being too much, and it breaks up the all-black.',
    author: 'James S.',
  },
  {
    quote:
      "A shelving unit with a flip-up door customization, and I'm really happy with how it turned out. The flip-up door works smoothly and blends perfectly with the overall design. It keeps the look clean and minimal while still making everything easy to access.",
    author: 'Kenny C.',
  },
  {
    quote:
      "Bought two ruby red P2 nightstands and I'm really happy with how they turned out. The color looks beautiful in person and adds a bold but elegant touch to the bedroom without being overwhelming.",
    author: 'Danny S. — A1 Desk Unit',
  },
  {
    quote:
      'Started with one sideboard and added a second bay a year later. It lined up perfectly with the original — no re-buying, no mismatched finish. That is the whole reason I chose this system.',
    author: 'Priya R.',
  },
]

function testimonials() {
  return box('Section', {
    _label: 'Testimonials',
    bg: C.cream,
    padding: '68px 0',
    content: [
      block('Heading', {
        text: 'What Customers Say',
        level: '2',
        textSize: '29px',
        fontWeight: '600',
        align: 'center',
        textColor: C.ink,
        margin: '0 0 30px 0',
      }),
      /**
       * A horizontally scrolling rail rather than a grid: the reference bleeds
       * the first and last card past the viewport edge, which is what tells the
       * reader there are more of them.
       */
      box('DivBlock', {
        _label: 'Review rail',
        className: 'sb-rail',
        padding: '4px 24px 10px 24px',
        content: REVIEWS.map(testimonial),
      }),
    ],
  })
}

const FAQS = [
  {
    q: 'How long does shipping take?',
    a: 'In-stock items ship within 7–14 business days within the continental US. Made-to-order pieces take about a week to produce plus 5–7 weeks for delivery — roughly 6–8 weeks in total.',
    open: true,
  },
  {
    q: "What's the return policy?",
    a: 'Returns are accepted within 30 days of delivery on unassembled, in-stock configurations. Made-to-order pieces are final sale because each one is built to your specification.',
    open: false,
  },
  {
    q: 'Is assembly required?',
    a: 'Yes, and it is designed to be done without tools. Panels and shelves click into the ball joints by hand; a two-bay sideboard takes most people under an hour.',
    open: false,
  },
  {
    q: 'What if my item arrives damaged?',
    a: 'Photograph the packaging and the damage and send it over within 14 days. Replacement panels ship individually, so a single dented shelf never means returning the whole piece.',
    open: false,
  },
  {
    q: 'Can I mix colors within one piece?',
    a: 'Every panel is specified separately, so a single unit can carry as many of the 15 colors as you like. Most people pick one base and use a second color as an accent.',
    open: false,
  },
]

/**
 * Rendered as `<details>` rather than assembled from blocks.
 *
 * An accordion built out of Div/Heading blocks would look right and do nothing —
 * there is no disclosure block in the registry, and a dead affordance is worse
 * than raw markup. `<details>` needs no JavaScript, so it survives SSR and works
 * on the published page exactly as it does in the builder canvas.
 */
function faqAccordionHtml(): string {
  return FAQS.map(
    (f) => `<details${f.open ? ' open' : ''}><summary>${f.q}</summary><p>${f.a}</p></details>`
  ).join('\n')
}

function faq() {
  return box('Section', {
    _label: 'FAQ',
    bg: C.white,
    padding: '70px 24px',
    content: [
      box('Container', {
        maxWidth: '1150px',
        padding: '0',
        content: [
          box('DivBlock', {
            className: 'sb-faq',
            content: [
              box('DivBlock', {
                _label: 'FAQ intro',
                maxWidth: '290px',
                content: [
                  block('Heading', {
                    text: 'Frequently Asked\nQuestions',
                    level: '2',
                    textSize: '27px',
                    lineHeight: '1.25',
                    fontWeight: '600',
                    whiteSpace: 'pre-line',
                    textColor: C.ink,
                    margin: '0 0 16px 0',
                  }),
                  block('Text', {
                    text: 'Our team can walk you through sizing, configurations, or anything else before you order.',
                    textSize: '11.5px',
                    lineHeight: '1.7',
                    textColor: C.body,
                    margin: '0 0 18px 0',
                  }),
                  block('Button', {
                    label: 'Get in touch →',
                    href: '#',
                    variant: 'outline',
                    className: 'sb-btn sb-btn-outline',
                  }),
                ],
              }),
              block('CodeEmbed', {
                _label: 'FAQ accordion',
                className: 'sb-acc',
                html: faqAccordionHtml(),
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

function spaceTile(label: string) {
  return box('DivBlock', {
    _label: `Space — ${label}`,
    className: 'sb-space',
    position: 'relative',
    height: '235px',
    borderRadius: '8px',
    overflow: 'hidden',
    bg: C.tile,
    content: [
      image(`${label.toLowerCase()} setup`),
      block('Text', {
        text: label,
        position: 'absolute',
        left: '13px',
        bottom: '12px',
        zIndex: '2',
        textSize: '13px',
        fontWeight: '600',
        textColor: '#FFFFFF',
      }),
    ],
  })
}

function findYourSpace() {
  return box('Section', {
    _label: 'Find your space',
    bg: C.white,
    padding: '10px 24px 84px 24px',
    content: [
      box('Container', {
        maxWidth: '1200px',
        padding: '0',
        content: [
          sectionHead({
            title: 'Find your space',
            copy: 'Not sure how it fits your room? See how the same system adapts to a living room wall, a bedroom corner, or a home office setup.',
            cta: 'View Gallery →',
            href: '#gallery',
            margin: '0 0 30px 0',
          }),
          box('DivBlock', {
            className: 'sb-grid-4',
            content: ['Living room', 'Office', 'Kitchen', 'Bedroom'].map(spaceTile),
          }),
        ],
      }),
    ],
  })
}

function pageContent() {
  return doc(
    [
      hero(),
      featureBar(),
      bestsellers(),
      howItWorks(),
      seeItStyled(),
      testimonials(),
      faq(),
      findYourSpace(),
    ],
    PAGE_CSS,
    'sb-page-css'
  )
}

// ── Seeder ─────────────────────────────────────────────────────────────────

const PAGE_PATH = 'staticbloom'

/**
 * Idempotent, like every other seeder here: an existing header, footer or page
 * is left exactly as it is. Re-running `db:seed` on a live site must never
 * overwrite edits someone made in the builder.
 */
export default class extends BaseSeeder {
  async run() {
    const header = await this.ensureTemplate('Static Bloom — Header', 'HEADER', headerContent())
    const footer = await this.ensureTemplate('Static Bloom — Footer', 'FOOTER', footerContent())

    const existing = await Page.query().where('path', PAGE_PATH).whereNull('deleted_at').first()
    if (existing) return

    await Page.create({
      id: newUlid(),
      title: 'Static Bloom — Home',
      path: PAGE_PATH,
      status: 'PUBLISHED',
      renderMode: 'SSR',
      content: pageContent(),
      seo: {
        title: 'Static Bloom — Built to reconfigure. Made to last.',
        description:
          'Ball-joint modular shelving, sideboards, and storage — mix colors, expand pieces, and redesign your space without buying new furniture.',
      },
      /**
       * Named explicitly as well as defaulted. The precedence in
       * `page_renderer` is per-page override first, site default second, so
       * pinning them keeps this page looking right even if the site defaults
       * later move to a different header.
       */
      headerTemplateId: header.id,
      footerTemplateId: footer.id,
      publishedAt: DateTime.now(),
    })
  }

  /**
   * Reuse a template of this type if the site already has a default, so a
   * second run never leaves two headers both claiming `is_default`.
   */
  private async ensureTemplate(
    name: string,
    type: 'HEADER' | 'FOOTER',
    content: Record<string, unknown>
  ): Promise<Template> {
    const existing = await Template.query()
      .where('type', type)
      .whereNull('deleted_at')
      .where((q) => q.where('name', name).orWhere('is_default', true))
      .first()
    if (existing) return existing

    return Template.create({
      id: newUlid(),
      name,
      type,
      content,
      isDefault: true,
    })
  }
}

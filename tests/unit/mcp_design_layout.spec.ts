import { test } from '@japa/runner'
import {
  normalizeFreeFrame,
  scaffoldFromLayout,
  toExpectations,
  type FreeNode,
  type LayoutNode,
} from '#services/design_layout_service'
import { lintLayout } from '#modules/mcp/services/layout_lint'
import type { ProbeBlock } from '#services/screenshot_service'

/**
 * Design-layout extraction + layout lint. These encode the six fidelity bugs the
 * Static Bloom rebuild surfaced — heading not centred, header row flex-end instead
 * of flex-start, a CTA hidden behind an overlapping band, a missing "+" overlay —
 * as a regression fixture: the extractor must INFER the right alignment/overlays
 * from geometry, and the lint must FLAG a build that drifts from them.
 */

// A synthetic FREE frame: a top-aligned header row (heading left + right column
// with a paragraph and a pill button), a centred testimonials title, and an image
// with a "+" hotspot sitting on top of it.
const FRAME: FreeNode = {
  _t: 'FRAME',
  id: 'frame',
  name: 'Design',
  pos: [0, 0],
  size: [1000, 800],
  layers: [
    {
      _t: 'FRAME',
      id: 'headerRow',
      name: 'headerRow',
      pos: [0, 0],
      size: [1000, 100],
      layers: [
        {
          _t: 'TEXT',
          id: 'title',
          name: 'title',
          pos: [0, 0],
          size: [220, 52],
          text: 'Our Bestsellers',
        },
        {
          _t: 'FRAME',
          id: 'rightCol',
          name: 'rightCol',
          pos: [700, 0],
          size: [300, 100],
          layers: [
            {
              _t: 'TEXT',
              id: 'sub',
              name: 'sub',
              pos: [0, 0],
              size: [300, 40],
              text: 'Supporting copy on the right.',
            },
            {
              _t: 'FRAME',
              id: 'btn',
              name: 'btn',
              pos: [180, 66],
              size: [120, 34],
              layers: [
                {
                  _t: 'TEXT',
                  id: 'cta',
                  name: 'cta',
                  pos: [10, 7],
                  size: [100, 20],
                  text: 'View all',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      _t: 'FRAME',
      id: 'reviews',
      name: 'reviews',
      pos: [0, 200],
      size: [1000, 150],
      layers: [
        {
          _t: 'TEXT',
          id: 'revTitle',
          name: 'revTitle',
          pos: [400, 0],
          size: [200, 50],
          text: 'What Customers Say',
        },
      ],
    },
    {
      _t: 'FRAME',
      id: 'how',
      name: 'how',
      pos: [0, 400],
      size: [1000, 400],
      layers: [
        {
          _t: 'RECT',
          id: 'cab',
          name: 'cab',
          pos: [100, 0],
          size: [800, 400],
          fills: [{ type: 4, pattern: { image: 'cabinet.png' } }],
        },
        { _t: 'INSTANCE', id: 'plus1', name: 'fi-sr-plus', pos: [300, 100], size: [40, 40] },
      ],
    },
  ],
}

function findByName(nodes: LayoutNode[], name: string): LayoutNode | undefined {
  for (const n of nodes) {
    if (n.name === name) return n
    const r = findByName(n.children, name)
    if (r) return r
  }
  return undefined
}

test.group('MCP design-layout | normalizeFreeFrame', () => {
  test('a top-aligned header row infers row + flex-start + space-between', ({ assert }) => {
    const facts = normalizeFreeFrame(FRAME)
    const row = findByName(facts.nodes, 'headerRow')!
    assert.equal(row.role, 'container')
    assert.equal(row.flexDirection, 'row')
    assert.equal(row.alignItems, 'flex-start')
    assert.equal(row.justifyContent, 'space-between')
  })

  test('the largest text becomes a left-aligned heading', ({ assert }) => {
    const facts = normalizeFreeFrame(FRAME)
    const title = findByName(facts.nodes, 'title')!
    assert.equal(title.role, 'heading')
    assert.equal(title.textAlign, 'left')
  })

  test('a horizontally centred title is inferred as center', ({ assert }) => {
    const facts = normalizeFreeFrame(FRAME)
    const rev = findByName(facts.nodes, 'revTitle')!
    assert.equal(rev.role, 'heading')
    assert.equal(rev.textAlign, 'center')
  })

  test('the right column stacks and right-aligns; the pill is a button', ({ assert }) => {
    const facts = normalizeFreeFrame(FRAME)
    const col = findByName(facts.nodes, 'rightCol')!
    assert.equal(col.flexDirection, 'column')
    assert.equal(col.alignItems, 'flex-end')
    assert.equal(findByName(facts.nodes, 'btn')!.role, 'button')
  })

  test('a badge over an image is detected as an overlay with % offsets', ({ assert }) => {
    const facts = normalizeFreeFrame(FRAME)
    const cab = findByName(facts.nodes, 'cab')!
    const plus = findByName(facts.nodes, 'fi-sr-plus')!
    assert.equal(cab.role, 'image')
    assert.equal(plus.overlayOf, cab.blockId)
    assert.equal(plus.leftPct, 25) // (300-100)/800
    assert.equal(plus.topPct, 25) // (100)/400
  })
})

test.group('MCP design-layout | scaffoldFromLayout', () => {
  test('the header row emits an HFlex with flex-start + space-between', ({ assert }) => {
    const facts = normalizeFreeFrame(FRAME)
    const row = findByName(facts.nodes, 'headerRow')!
    const doc = scaffoldFromLayout(facts, { wrapSection: false })
    const block = findBlock(doc.content, row.blockId)!
    assert.equal(block.type, 'HFlex')
    assert.equal((block.props as any).alignItems, 'flex-start')
    assert.equal((block.props as any).justifyContent, 'space-between')
  })

  test('an image with an overlay is wrapped relative + absolute marker', ({ assert }) => {
    const facts = normalizeFreeFrame(FRAME)
    const cab = findByName(facts.nodes, 'cab')!
    const plus = findByName(facts.nodes, 'fi-sr-plus')!
    const doc = scaffoldFromLayout(facts, { wrapSection: false })
    const wrap = findBlock(doc.content, `${cab.blockId}-wrap`)!
    assert.equal((wrap.props as any).position, 'relative')
    const marker = findBlock(doc.content, plus.blockId)!
    assert.equal(marker.type, 'DivBlock')
    assert.equal((marker.props as any).position, 'absolute')
    assert.equal((marker.props as any).left, '25%')
  })
})

test.group('MCP design-layout | lintLayout', () => {
  test('flags cross-axis, text-align, occlusion and missing overlay with ops', ({ assert }) => {
    const facts = normalizeFreeFrame(FRAME)
    const expects = toExpectations(facts)
    const rowId = findByName(facts.nodes, 'headerRow')!.blockId
    const revId = findByName(facts.nodes, 'revTitle')!.blockId
    const titleId = findByName(facts.nodes, 'title')!.blockId
    // The overlay marker (fi-sr-plus) is intentionally left OUT of the probe below
    // so the lint reports missing-overlay.

    // A build that drifts: header row is flex-end (bug #4/#5), the centred title
    // renders left (bug #6), the heading is occluded (bug #2), the overlay marker
    // was never rendered (bug #3).
    const probe = {
      viewport: 'desktop' as const,
      viewportW: 1000,
      blocks: [
        pb(rowId, { alignItems: 'flex-end', justifyContent: 'space-between' }),
        pb(revId, { textAlign: 'left' }),
        pb(titleId, { textAlign: 'left' }, 'someOtherBlock'),
        // plusId intentionally absent → missing-overlay
      ],
    }

    const report = lintLayout({ probe, expects })
    const kinds = report.issues.map((i) => i.kind)
    assert.include(kinds, 'cross-axis')
    assert.include(kinds, 'text-align')
    assert.include(kinds, 'occluded')
    assert.include(kinds, 'missing-overlay')

    const cross = report.issues.find((i) => i.kind === 'cross-axis')!
    assert.deepEqual(cross.suggestedOp, {
      op: 'update_style',
      id: rowId,
      props: { alignItems: 'flex-start' },
    })
    const ta = report.issues.find((i) => i.kind === 'text-align')!
    assert.deepEqual(ta.suggestedOp, { op: 'update_props', id: revId, props: { align: 'center' } })
  })

  test('a clean build produces no issues', ({ assert }) => {
    const facts = normalizeFreeFrame(FRAME)
    const expects = toExpectations(facts)
    const rowId = findByName(facts.nodes, 'headerRow')!.blockId
    const revId = findByName(facts.nodes, 'revTitle')!.blockId
    const plusId = findByName(facts.nodes, 'fi-sr-plus')!.blockId
    const probe = {
      viewport: 'desktop' as const,
      viewportW: 1000,
      blocks: [
        pb(rowId, { alignItems: 'flex-start', justifyContent: 'space-between' }),
        pb(revId, { textAlign: 'center' }),
        pb(plusId, {}),
      ],
    }
    const report = lintLayout({ probe, expects })
    assert.lengthOf(report.issues, 0)
  })
})

// ── helpers ──────────────────────────────────────────────────────────────────

function findBlock(
  content: Array<{ type: string; props: Record<string, unknown> }>,
  id: string
): { type: string; props: Record<string, unknown> } | undefined {
  for (const b of content) {
    if ((b.props as any).id === id) return b
    const kids = (b.props as any).content
    if (Array.isArray(kids)) {
      const r = findBlock(kids, id)
      if (r) return r
    }
  }
  return undefined
}

function pb(
  id: string,
  styles: Partial<ProbeBlock['styles']>,
  occludedBy: string | null = null
): ProbeBlock {
  return {
    id,
    rect: { x: 0, y: 0, w: 100, h: 40 },
    styles: {
      textAlign: 'left',
      alignItems: 'normal',
      justifyContent: 'normal',
      position: 'static',
      display: 'block',
      ...styles,
    },
    occludedBy,
  }
}

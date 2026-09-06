import { test } from '@japa/runner'
import { generateResponsive } from '#modules/mcp/services/auto_responsive'

/**
 * Auto-responsive: fills sensible mobile/tablet overrides so an MCP-built,
 * desktop-first page is usable on a phone — additively (never clobbering the
 * author's own responsive) and only where it makes sense.
 */
function doc(content: unknown) {
  return { root: { props: {} }, content }
}
const resp = (node: { props?: Record<string, any> }) => node.props?.responsive ?? {}

test.group('MCP auto-responsive | generateResponsive', () => {
  test('a 4-column grid drops to 2 on mobile and 2 on tablet', ({ assert }) => {
    const d = doc([{ type: 'Grid', props: { id: 'g', columns: '4', content: [] } }]) as any
    generateResponsive(d)
    const r = resp(d.content[0])
    assert.equal(r.mobile.columns, '2')
    assert.equal(r.tablet.columns, '2')
  })

  test('a 3-column grid drops to 1 on mobile', ({ assert }) => {
    const d = doc([{ type: 'Grid', props: { id: 'g', columns: '3', content: [] } }]) as any
    generateResponsive(d)
    assert.equal(resp(d.content[0]).mobile.columns, '1')
  })

  test('Columns uses its `count` field', ({ assert }) => {
    const d = doc([{ type: 'Columns', props: { id: 'c', count: '3', content: [] } }]) as any
    generateResponsive(d)
    assert.equal(resp(d.content[0]).mobile.count, '1')
  })

  test('a split HFlex (a %-width child) stacks and its children go full width', ({ assert }) => {
    const d = doc([
      {
        type: 'HFlex',
        props: {
          id: 'h',
          content: [
            { type: 'VFlex', props: { id: 'l', width: '55%', content: [] } },
            { type: 'Image', props: { id: 'r', width: '45%', src: '/x.jpg' } },
          ],
        },
      },
    ]) as any
    generateResponsive(d)
    const hf = d.content[0]
    assert.equal(resp(hf).mobile.flexDirection, 'column')
    const kids = hf.props.content
    assert.equal(resp(kids[0]).mobile.width, '100%')
    assert.equal(resp(kids[1]).mobile.width, '100%')
  })

  test('an inline HFlex (buttons/swatches — no %-width child) is NOT stacked', ({ assert }) => {
    const d = doc([
      {
        type: 'HFlex',
        props: {
          id: 'row',
          gap: '8px',
          content: [
            { type: 'DivBlock', props: { id: 'd1', width: '13px', height: '13px' } },
            { type: 'DivBlock', props: { id: 'd2', width: '13px', height: '13px' } },
          ],
        },
      },
    ]) as any
    generateResponsive(d)
    assert.isUndefined(resp(d.content[0]).mobile)
  })

  test('a big heading is scaled down; a small one is left alone', ({ assert }) => {
    const d = doc([
      { type: 'Heading', props: { id: 'big', text: 'Hi', textSize: '48px' } },
      { type: 'Heading', props: { id: 'small', text: 'Sub', textSize: '16px' } },
    ]) as any
    generateResponsive(d)
    assert.equal(resp(d.content[0]).mobile.textSize, '29px')
    assert.isUndefined(resp(d.content[1]).mobile)
  })

  test('a tall hero Section trims minHeight on mobile', ({ assert }) => {
    const d = doc([{ type: 'Section', props: { id: 's', minHeight: '600px', content: [] } }]) as any
    generateResponsive(d)
    assert.equal(resp(d.content[0]).mobile.minHeight, '420px')
  })

  test("the author's own responsive override is never clobbered", ({ assert }) => {
    const d = doc([
      { type: 'Grid', props: { id: 'g', columns: '4', responsive: { mobile: { columns: '3' } }, content: [] } },
    ]) as any
    generateResponsive(d)
    assert.equal(resp(d.content[0]).mobile.columns, '3') // kept, not overwritten
    assert.equal(resp(d.content[0]).tablet.columns, '2') // still filled where missing
  })

  test('recurses into nested slots and reports a touched count', ({ assert }) => {
    const d = doc([
      { type: 'Section', props: { id: 's', content: [{ type: 'Grid', props: { id: 'g', columns: '4', content: [] } }] } },
    ]) as any
    const r = generateResponsive(d)
    assert.isAbove(r.touched, 0)
    assert.equal(resp(d.content[0].props.content[0]).mobile.columns, '2')
  })
})

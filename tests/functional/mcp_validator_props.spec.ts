import { test } from '@japa/runner'
import { validatePuckDocument } from '#modules/mcp/services/puck_content_validator'

/**
 * The validator's prop/style pass and change log: it warns (never blocks) on
 * prop keys a block doesn't know, records what normalization rewrote, and
 * suggests the nearest block type for a typo — the signal the validate→fix loop
 * needs to converge, instead of only "unknown block type".
 */
function page(content: unknown) {
  return { root: { props: {} }, content }
}

test.group('MCP validator | props & changes', () => {
  test('an unknown prop key is a non-blocking warning', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([{ type: 'Heading', props: { id: 'h', text: 'Hi', nonsenseProp: 'x' } }]),
      'page'
    )
    assert.isTrue(res.valid) // still publishes
    assert.isTrue(res.warnings.some((w) => /nonsenseProp/.test(w.message)))
  })

  test('a layout styleProp is accepted (no warning)', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([{ type: 'Section', props: { id: 's', display: 'flex', gap: '16px', alignItems: 'center', content: [] } }]),
      'page'
    )
    assert.isTrue(res.valid)
    assert.isFalse(res.warnings.some((w) => /display|gap|alignItems/.test(w.message)))
  })

  test('a filled-in block id is reported in changes', async ({ assert }) => {
    const res = await validatePuckDocument(page([{ type: 'Heading', props: { text: 'Hi' } }]), 'page')
    assert.isTrue(res.valid)
    assert.isTrue(res.changes.some((c) => /generated id/.test(c.message)))
  })

  test('a misplaced slot array is migrated and reported in changes', async ({ assert }) => {
    // children put as a sibling of props (a common mistake) — migrated into props.content.
    const res = await validatePuckDocument(
      page([{ type: 'Section', props: { id: 's' }, content: [{ type: 'Heading', props: { id: 'h', text: 'Hi' } }] }]),
      'page'
    )
    assert.isTrue(res.valid)
    assert.isTrue(res.changes.some((c) => /misplaced "content"/.test(c.message)))
  })

  test('an unknown block type suggests the nearest valid type', async ({ assert }) => {
    const res = await validatePuckDocument(page([{ type: 'Headng', props: {} }]), 'page')
    assert.isFalse(res.valid)
    assert.isTrue(res.issues.some((i) => /did you mean "Heading"/.test(i.message)))
  })

  test('intuitive CSS aliases are renamed to canonical keys (not dropped)', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([
        {
          type: 'Heading',
          props: {
            id: 'h',
            text: 'Hi',
            textAlign: 'center',
            fontSize: '44px',
            fontFamily: 'Geist',
            color: '#221D17',
            backgroundColor: '#fff',
          },
        },
      ]),
      'page'
    )
    assert.isTrue(res.valid)
    const props = (res.normalized.content![0] as any).props
    // aliases removed, canonical keys set
    assert.deepEqual(props.align, 'center')
    assert.deepEqual(props.textSize, '44px')
    assert.deepEqual(props.font, 'Geist')
    assert.deepEqual(props.textColor, '#221D17')
    assert.deepEqual(props.bg, '#fff')
    assert.isUndefined(props.textAlign)
    assert.isUndefined(props.fontSize)
    // each rename is reported, and none is treated as a dropped/unknown prop
    assert.isTrue(res.changes.some((c) => /renamed "textAlign" → "align"/.test(c.message)))
    assert.isEmpty(res.droppedProps)
  })

  test('an alias yields to an already-set canonical key (dropped with a warning)', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([{ type: 'Heading', props: { id: 'h', text: 'Hi', align: 'left', textAlign: 'center' } }]),
      'page'
    )
    const props = (res.normalized.content![0] as any).props
    assert.deepEqual(props.align, 'left') // explicit canonical kept
    assert.isUndefined(props.textAlign)
    assert.isTrue(res.warnings.some((w) => /both "textAlign" and "align"/.test(w.message)))
  })

  test('per-side margin/padding longhands are accepted (no warning)', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([
        {
          type: 'Section',
          props: { id: 's', marginTop: '-81px', paddingLeft: '64px', paddingRight: '64px', content: [] },
        },
      ]),
      'page'
    )
    assert.isTrue(res.valid)
    assert.isFalse(res.warnings.some((w) => /marginTop|paddingLeft|paddingRight/.test(w.message)))
    assert.isEmpty(res.droppedProps)
  })

  test('a truly unknown prop is rolled up in droppedProps', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([{ type: 'Heading', props: { id: 'h', text: 'Hi', nonsenseProp: 'x' } }]),
      'page'
    )
    assert.isTrue(res.valid)
    assert.isTrue(res.droppedProps.some((d) => d.key === 'nonsenseProp' && d.type === 'Heading'))
  })
})

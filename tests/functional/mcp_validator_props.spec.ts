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
})

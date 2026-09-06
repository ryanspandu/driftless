import { test } from '@japa/runner'
import { applyPatchOps, type PatchOp } from '#modules/mcp/services/puck_patch'

/**
 * The block-addressed patch ops: address a block by its stable props.id and
 * apply a small diff to the draft, instead of re-sending the whole tree.
 */
function doc() {
  return {
    root: { props: {} },
    content: [
      {
        type: 'Section',
        props: {
          id: 'sec1',
          bg: '#fff',
          content: [
            { type: 'Heading', props: { id: 'h1', text: 'Hello', textSize: '32px' } },
            { type: 'Paragraph', props: { id: 'p1', text: 'World' } },
          ],
        },
      },
    ],
  }
}

test.group('MCP puck patch | applyPatchOps', () => {
  test('update_props merges into a nested block without touching siblings', ({ assert }) => {
    const res = applyPatchOps(doc(), [
      { op: 'update_props', id: 'h1', props: { text: 'Hi', level: '2' } },
    ])
    assert.isEmpty(res.errors)
    const h = res.doc.content![0].props!.content as Array<{ props: Record<string, unknown> }>
    assert.equal(h[0].props.text, 'Hi')
    assert.equal(h[0].props.level, '2')
    assert.equal(h[0].props.textSize, '32px') // untouched
    assert.equal(h[1].props.text, 'World') // sibling untouched
  })

  test('update_style merges style props', ({ assert }) => {
    const res = applyPatchOps(doc(), [{ op: 'update_style', id: 'sec1', props: { padding: '80px 0' } }])
    assert.isEmpty(res.errors)
    assert.equal(res.doc.content![0].props!.padding, '80px 0')
    assert.equal(res.doc.content![0].props!.bg, '#fff')
  })

  test('insert into a slot at an index', ({ assert }) => {
    const res = applyPatchOps(doc(), [
      { op: 'insert', parentId: 'sec1', slot: 'content', index: 1, block: { type: 'Button', props: { id: 'b1', label: 'Go' } } },
    ])
    assert.isEmpty(res.errors)
    const kids = res.doc.content![0].props!.content as Array<{ props: { id: string } }>
    assert.deepEqual(kids.map((k) => k.props.id), ['h1', 'b1', 'p1'])
  })

  test('insert with no parentId lands at the document root', ({ assert }) => {
    const res = applyPatchOps(doc(), [{ op: 'insert', block: { type: 'Section', props: { id: 'sec2' } } }])
    assert.isEmpty(res.errors)
    assert.lengthOf(res.doc.content!, 2)
  })

  test('move relocates a block into another parent/slot', ({ assert }) => {
    const start = doc()
    ;(start.content[0].props.content as unknown[]).push({ type: 'Container', props: { id: 'c1', content: [] } })
    const res = applyPatchOps(start, [{ op: 'move', id: 'p1', parentId: 'c1', slot: 'content' }])
    assert.isEmpty(res.errors)
    const sec = res.doc.content![0].props!.content as Array<{ props: { id: string; content?: unknown[] } }>
    assert.notInclude(sec.filter((k) => k.props.id !== 'c1').map((k) => k.props.id), 'p1')
    const container = sec.find((k) => k.props.id === 'c1')!
    assert.equal((container.props.content as Array<{ props: { id: string } }>)[0].props.id, 'p1')
  })

  test('remove deletes a block by id', ({ assert }) => {
    const res = applyPatchOps(doc(), [{ op: 'remove', id: 'p1' }])
    assert.isEmpty(res.errors)
    const kids = res.doc.content![0].props!.content as Array<{ props: { id: string } }>
    assert.deepEqual(kids.map((k) => k.props.id), ['h1'])
  })

  test('a bad op records an error and does not abort the batch', ({ assert }) => {
    const ops: PatchOp[] = [
      { op: 'update_props', id: 'nope', props: { text: 'x' } },
      { op: 'update_props', id: 'h1', props: { text: 'ok' } },
    ]
    const res = applyPatchOps(doc(), ops)
    assert.lengthOf(res.errors, 1)
    assert.match(res.errors[0], /nope/)
    const h = (res.doc.content![0].props!.content as Array<{ props: Record<string, unknown> }>)[0]
    assert.equal(h.props.text, 'ok') // the good op still applied
  })

  test('does not mutate the input document', ({ assert }) => {
    const input = doc()
    applyPatchOps(input, [{ op: 'remove', id: 'h1' }])
    const kids = input.content[0].props.content as unknown[]
    assert.lengthOf(kids, 2) // original untouched (deep clone)
  })
})

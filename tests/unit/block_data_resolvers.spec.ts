import { test } from '@japa/runner'
import {
  clearBlockResolvers,
  registerBlockResolver,
  registeredBlockTypes,
  resolveBlockData,
} from '#services/block_data_resolvers'

/** A Puck-shaped document with the given blocks as its content. */
function doc(content: unknown[]) {
  return { content }
}

test.group('Block data resolvers', (group) => {
  group.each.setup(() => {
    clearBlockResolvers()
    return () => clearBlockResolvers()
  })

  test('resolves a registered block', async ({ assert }) => {
    registerBlockResolver('Thing', {
      collect: (props) => (props.id ? { key: `thing:${props.id}` } : null),
      resolve: async (refs) => Object.fromEntries(refs.map((r) => [r.key, { loaded: true }])),
    })

    const data = await resolveBlockData([doc([{ type: 'Thing', props: { id: 'a' } }])])
    assert.deepEqual(data, { 'thing:a': { loaded: true } })
  })

  test('ignores blocks with no resolver', async ({ assert }) => {
    const data = await resolveBlockData([doc([{ type: 'Unknown', props: { id: 'a' } }])])
    assert.deepEqual(data, {})
  })

  test('skips a block instance that is not bound to anything', async ({ assert }) => {
    registerBlockResolver('Thing', {
      collect: (props) => (props.id ? { key: `thing:${props.id}` } : null),
      resolve: async (refs) => Object.fromEntries(refs.map((r) => [r.key, true])),
    })

    const data = await resolveBlockData([doc([{ type: 'Thing', props: {} }])])
    assert.deepEqual(data, {})
  })

  test('finds blocks nested inside other props', async ({ assert }) => {
    registerBlockResolver('Thing', {
      collect: (props) => (props.id ? { key: `thing:${props.id}` } : null),
      resolve: async (refs) => Object.fromEntries(refs.map((r) => [r.key, true])),
    })

    /** Puck nests blocks inside slot props, so the walk must recurse. */
    const nested = doc([
      {
        type: 'Section',
        props: {
          children: [{ type: 'Thing', props: { id: 'deep' } }],
        },
      },
    ])

    const data = await resolveBlockData([nested])
    assert.deepEqual(data, { 'thing:deep': true })
  })

  test('walks zones as well as content', async ({ assert }) => {
    registerBlockResolver('Thing', {
      collect: (props) => (props.id ? { key: `thing:${props.id}` } : null),
      resolve: async (refs) => Object.fromEntries(refs.map((r) => [r.key, true])),
    })

    const data = await resolveBlockData([
      { content: [], zones: { 'main:zone': [{ type: 'Thing', props: { id: 'z' } }] } },
    ])
    assert.deepEqual(data, { 'thing:z': true })
  })

  test('fetches a repeated reference only once', async ({ assert }) => {
    let calls = 0
    registerBlockResolver('Thing', {
      collect: (props) => ({ key: `thing:${props.id}` }),
      resolve: async (refs) => {
        calls += refs.length
        return Object.fromEntries(refs.map((r) => [r.key, true]))
      },
    })

    await resolveBlockData([
      doc([
        { type: 'Thing', props: { id: 'same' } },
        { type: 'Thing', props: { id: 'same' } },
        { type: 'Thing', props: { id: 'other' } },
      ]),
    ])

    assert.equal(calls, 2, 'the duplicate reference is deduplicated by key')
  })

  test('batches every reference into one resolver call', async ({ assert }) => {
    let invocations = 0
    registerBlockResolver('Thing', {
      collect: (props) => ({ key: `thing:${props.id}` }),
      resolve: async (refs) => {
        invocations++
        return Object.fromEntries(refs.map((r) => [r.key, true]))
      },
    })

    await resolveBlockData([
      doc([
        { type: 'Thing', props: { id: 'a' } },
        { type: 'Thing', props: { id: 'b' } },
        { type: 'Thing', props: { id: 'c' } },
      ]),
    ])

    assert.equal(invocations, 1, 'one round trip, not one per block')
  })

  test('omits volatile resolvers when they must not be cached', async ({ assert }) => {
    registerBlockResolver('Stable', {
      collect: () => ({ key: 'stable' }),
      resolve: async (refs) => Object.fromEntries(refs.map((r) => [r.key, 'ok'])),
    })

    registerBlockResolver('Volatile', {
      volatile: true,
      collect: () => ({ key: 'volatile' }),
      resolve: async (refs) => Object.fromEntries(refs.map((r) => [r.key, 'ok'])),
    })

    const page = doc([
      { type: 'Stable', props: {} },
      { type: 'Volatile', props: {} },
    ])

    /**
     * The SSG case. Price and stock must not be baked into a snapshot — a
     * cached page promising "in stock" for something sold out an hour ago is
     * worse than one that says nothing.
     */
    const forSnapshot = await resolveBlockData([page], { includeVolatile: false })
    assert.deepEqual(forSnapshot, { stable: 'ok' })

    const forRequest = await resolveBlockData([page])
    assert.deepEqual(forRequest, { stable: 'ok', volatile: 'ok' })
  })

  test('one failing resolver does not take the page down', async ({ assert }) => {
    registerBlockResolver('Good', {
      collect: () => ({ key: 'good' }),
      resolve: async (refs) => Object.fromEntries(refs.map((r) => [r.key, 'ok'])),
    })

    registerBlockResolver('Bad', {
      collect: () => ({ key: 'bad' }),
      resolve: async () => {
        throw new Error('upstream exploded')
      },
    })

    const data = await resolveBlockData([
      doc([
        { type: 'Good', props: {} },
        { type: 'Bad', props: {} },
      ]),
    ])

    // A product strip that cannot load renders empty; the rest of the page lives.
    assert.equal(data.good, 'ok')
    assert.isNull(data.bad)
  })

  test('refuses to register the same block type twice', ({ assert }) => {
    registerBlockResolver('Thing', {
      collect: () => ({ key: 'x' }),
      resolve: async () => ({}),
    })

    assert.throws(
      () =>
        registerBlockResolver('Thing', {
          collect: () => ({ key: 'y' }),
          resolve: async () => ({}),
        }),
      /already registered/
    )
  })

  test('reports what is registered', ({ assert }) => {
    registerBlockResolver('B', { collect: () => null, resolve: async () => ({}) })
    registerBlockResolver('A', { collect: () => null, resolve: async () => ({}) })

    assert.deepEqual(registeredBlockTypes(), ['A', 'B'])
  })

  test('does nothing when nothing is registered', async ({ assert }) => {
    const data = await resolveBlockData([doc([{ type: 'Thing', props: { id: 'a' } }])])
    assert.deepEqual(data, {})
  })
})

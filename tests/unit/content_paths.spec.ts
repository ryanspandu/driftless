import { test } from '@japa/runner'
import '@japa/assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CONTENT_PATH_DEFAULTS,
  CONTENT_PATH_KEYS,
  CONTENT_PATH_SECTION,
  contentPathUrl,
  isValidPrefix,
  mapContentPaths,
  normalizePrefix,
} from '#services/content_paths'

test.group('Content paths — normalising and mapping', () => {
  test('defaults are the historical routes', ({ assert }) => {
    assert.deepEqual(mapContentPaths({}), {
      archive: 'blog',
      detail: 'posts',
      category: 'category',
      tag: 'tag',
    })
  })

  test('normalizePrefix trims, lowercases and strips edge slashes', ({ assert }) => {
    assert.equal(normalizePrefix(' /Insights/ '), 'insights')
    assert.equal(normalizePrefix('//resources/insights//'), 'resources/insights')
    assert.equal(normalizePrefix(undefined), '')
  })

  test('isValidPrefix accepts slug segments and rejects everything else', ({ assert }) => {
    for (const ok of ['insights', 'resources/insights', 'a-b/c-d', 'v2']) {
      assert.isTrue(isValidPrefix(ok), ok)
    }
    for (const bad of ['', 'In Sights', 'a//b', '-a', 'a-', 'a/../b', 'x'.repeat(121), 'a_b']) {
      assert.isFalse(isValidPrefix(bad), bad)
    }
  })

  test('an unusable stored value falls back to that screen’s default', ({ assert }) => {
    const paths = mapContentPaths({
      [CONTENT_PATH_SECTION]: {
        [CONTENT_PATH_KEYS.archive]: 'insights',
        [CONTENT_PATH_KEYS.detail]: 'not valid!',
        [CONTENT_PATH_KEYS.tag]: '',
      },
    })
    assert.equal(paths.archive, 'insights')
    assert.equal(paths.detail, 'posts')
    assert.equal(paths.tag, 'tag')
  })

  test('contentPathUrl builds the archive and the detail URL', ({ assert }) => {
    const paths = { ...CONTENT_PATH_DEFAULTS, archive: 'insights', detail: 'insights' }
    assert.equal(contentPathUrl(paths, 'archive'), '/insights')
    assert.equal(contentPathUrl(paths, 'detail', 'hello'), '/insights/hello')
  })
})

test.group('Content paths — server/client mirror', () => {
  test('CONTENT_PATH_FIELDS in the client declares exactly the server keys and defaults', async ({
    assert,
  }) => {
    const client = await readFile(join(process.cwd(), 'inertia/types/api.ts'), 'utf-8')
    assert.include(client, `CONTENT_PATHS: '${CONTENT_PATH_SECTION}'`)
    const block = client.slice(client.indexOf('export const CONTENT_PATH_FIELDS'))
    const declared = [
      ...block.matchAll(/key: '([a-z_]+)',\s*label: '[^']*',\s*default: '([a-z-]+)'/g),
    ]
      .slice(0, 4)
      .map((m) => [m[1], m[2]])
    const expected = Object.entries(CONTENT_PATH_KEYS).map(([kind, key]) => [
      key,
      CONTENT_PATH_DEFAULTS[kind as keyof typeof CONTENT_PATH_DEFAULTS],
    ])
    assert.sameDeepMembers(declared, expected)
  })

  test('the Inertia hook falls back to the same defaults', async ({ assert }) => {
    const hook = await readFile(join(process.cwd(), 'inertia/lib/content_paths.ts'), 'utf-8')
    const body = hook.slice(hook.indexOf('DEFAULT_CONTENT_PATHS'))
    const declared = Object.fromEntries(
      [...body.matchAll(/(archive|detail|category|tag): '([a-z-]+)'/g)]
        .slice(0, 4)
        .map((m) => [m[1], m[2]])
    )
    assert.deepEqual(declared, CONTENT_PATH_DEFAULTS)
  })
})

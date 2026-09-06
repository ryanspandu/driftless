import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'

/**
 * Drift guard for the MCP style vocabulary.
 *
 * The catalog advertises `RENDERED_STYLE_PROP_NAMES` (inertia/puck/style-fields.tsx)
 * as each block's `styleProps` so an MCP client knows every prop the renderer
 * honours — not just the ~17 that have a visual editor control. If `styleToCss`
 * grows a new `str(s, 'X')` / `num(s, 'X')` read that isn't in that list (or in
 * the emitted catalog), the model would silently be unable to request it. This
 * scans the SOURCE (the Adonis runtime cannot import the React module) and fails
 * on any such drift.
 */

const STYLE_FIELDS = 'inertia/puck/style-fields.tsx'

function slice(src: string, from: string, toMarkers: string[]): string {
  const start = src.indexOf(from)
  if (start === -1) throw new Error(`marker not found: ${from}`)
  let end = src.length
  for (const m of toMarkers) {
    const i = src.indexOf(m, start + from.length)
    if (i !== -1 && i < end) end = i
  }
  return src.slice(start, end)
}

/** Prop names read out of the style bag inside styleToCss. */
function styleToCssReads(src: string): Set<string> {
  const body = slice(src, 'function styleToCss(', ['\nfunction ', '\nexport '])
  const out = new Set<string>()
  for (const m of body.matchAll(/(?:str|num)\(s,\s*'([a-zA-Z]+)'\)/g)) out.add(m[1]!)
  // Read structurally rather than via str(): the background layer stack.
  if (/readLayers\(s\.backgrounds\)/.test(body)) out.add('backgrounds')
  return out
}

/** The declared RENDERED_STYLE_PROP_NAMES array literal. */
function declaredNames(src: string): Set<string> {
  const arr = slice(src, 'RENDERED_STYLE_PROP_NAMES: string[] = [', [']'])
  const out = new Set<string>()
  for (const m of arr.matchAll(/'([a-zA-Z]+)'/g)) out.add(m[1]!)
  return out
}

test.group('MCP style vocabulary | drift guard', () => {
  test('every styleToCss prop is declared in RENDERED_STYLE_PROP_NAMES', async ({ assert }) => {
    const src = await readFile(app.makePath(STYLE_FIELDS), 'utf8')
    const reads = styleToCssReads(src)
    const declared = declaredNames(src)
    assert.isAbove(declared.size, 40, 'expected the full renderer vocabulary, not just the editor controls')
    const missing = [...reads].filter((p) => !declared.has(p))
    assert.deepEqual(
      missing,
      [],
      `styleToCss reads props not in RENDERED_STYLE_PROP_NAMES (add them so the MCP advertises them): ${missing.join(', ')}`
    )
  })

  test('the emitted page catalog advertises the full vocabulary on every block', async ({
    assert,
  }) => {
    const src = await readFile(app.makePath(STYLE_FIELDS), 'utf8')
    const declared = declaredNames(src)
    const catalog = JSON.parse(
      await readFile(app.makePath('resources/mcp/catalog.page.json'), 'utf8')
    ) as { blocks: Array<{ type: string; styleProps: string[] }> }
    const section = catalog.blocks.find((b) => b.type === 'Section')
    assert.exists(section, 'Section block should exist in the catalog')
    const advertised = new Set(section!.styleProps)
    const missing = [...declared].filter((p) => !advertised.has(p))
    assert.deepEqual(
      missing,
      [],
      `catalog.page.json is stale — re-run "node ace mcp:catalog". Missing: ${missing.join(', ')}`
    )
    // The layout/positioning knobs that were previously hidden must be present.
    for (const p of ['display', 'flexDirection', 'justifyContent', 'alignItems', 'gap', 'position', 'zIndex', 'transform']) {
      assert.isTrue(advertised.has(p), `catalog must advertise "${p}"`)
    }
  })
})

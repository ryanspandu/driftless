import { test } from '@japa/runner'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Page-builder UI conventions, enforced by grep.
 *
 * Two rules the operator asked for, both easy to regress one edit at a time:
 * every dropdown in the builder is the app's select component, and the
 * builder's accent is the brand token set, not a hard-coded blue. The
 * allow-lists below are the deliberate exceptions, each with a reason.
 */

const ROOT = new URL('../../', import.meta.url).pathname
const PUCK_DIR = join(ROOT, 'inertia/puck')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(name) && !name.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length
}

function builderFiles(): Array<{ path: string; source: string }> {
  return walk(PUCK_DIR).map((path) => ({
    path: relative(ROOT, path),
    source: readFileSync(path, 'utf8'),
  }))
}

test.group('Builder UI conventions', () => {
  test('the only native <select> left is the unit picker', ({ assert }) => {
    const hits = builderFiles()
      .map((f) => ({ path: f.path, count: countMatches(f.source, /<select\b/g) }))
      .filter((f) => f.count > 0)
    // px / % / rem beside a number input: too narrow for a bordered dropdown.
    assert.deepEqual(hits, [{ path: 'inertia/puck/style-controls.tsx', count: 1 }])

    const optgroups = builderFiles().filter((f) => /<optgroup/.test(f.source))
    assert.deepEqual(
      optgroups.map((f) => f.path),
      []
    )
  })

  test('the builder accent is the brand token set, not Tailwind blue', ({ assert }) => {
    const blue = builderFiles()
      .filter((f) => /\b(bg|text|border|accent|ring|outline)-blue-\d+/.test(f.source))
      .map((f) => f.path)
      .sort()
    assert.deepEqual(blue, [
      // A Google search-result preview: that blue *is* the reference.
      'inertia/puck/settings-dialog.tsx',
      // The "CSS" language badge, paired with an amber "JS" one.
      'inertia/puck/snippet-manager.tsx',
    ])

    // "Bound to a CMS field" moved from an ad-hoc violet to `--builder-bound`.
    const violet = builderFiles().filter((f) => /\bviolet-\d+/.test(f.source))
    assert.deepEqual(
      violet.map((f) => f.path),
      []
    )
  })

  test('the dead native select wrapper stays deleted', ({ assert }) => {
    assert.isFalse(existsSync(join(ROOT, 'inertia/components/ui/select.tsx')))
  })

  test('app.css themes Puck and the builder ring from the brand', ({ assert }) => {
    const css = readFileSync(join(ROOT, 'inertia/css/app.css'), 'utf8')

    const block = (selector: string) => {
      const start = css.indexOf(`${selector} {`)
      assert.isAbove(start, -1, `${selector} block missing`)
      return css.slice(start, css.indexOf('\n}', start))
    }
    for (const selector of ['html:not(.dark)', 'html.dark']) {
      const body = block(selector)
      for (let i = 1; i <= 12; i++) {
        const name = `--puck-color-azure-${String(i).padStart(2, '0')}`
        assert.include(body, `${name}:`, `${selector} lacks ${name}`)
      }
      assert.include(body, 'var(--primary)')
    }

    assert.match(css, /\[data-builder\]\s*\{\s*--ring:\s*var\(--primary\)/)
    for (const token of [
      '--builder-set',
      '--builder-selected',
      '--builder-slider',
      '--builder-bound',
      '--color-builder-bound',
    ]) {
      assert.include(css, `${token}:`)
    }
  })
})

import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'

/**
 * Drift guard for the two hand-duplicated MCP tool manifests.
 *
 * The builder-API is exposed through TWO manifests that must stay identical:
 *  - `modules/mcp/mcp_tools.ts` — the in-app HTTP MCP server (tools registered
 *    inside a `registerMcpTools(server)` function, 4-space indented).
 *  - `modules/mcp/server/src/index.ts` — the standalone stdio MCP server
 *    (top-level `server.tool(...)` calls, 2-space indented).
 *
 * A tool added, renamed, re-described, or re-shaped in one but not the other is
 * a silent capability/quality gap for whichever transport a client uses. A full
 * shared-source refactor across the two packages is out of scope (higher risk),
 * so this test enforces parity instead: same tool NAMES, same DESCRIPTION text,
 * and the same top-level SCHEMA field keys per tool. It scans the source (the
 * two packages can't be co-imported without side effects) — the same parse that
 * the manifests were verified with by hand.
 */

const IN_APP = 'modules/mcp/mcp_tools.ts'
const STDIO = 'modules/mcp/server/src/index.ts'

interface ToolDef {
  name: string
  desc: string
  /** Top-level schema field keys + `...spread` names, sorted. */
  schemaKeys: string[]
}

/** Read one JS string literal (', ", or `) starting at `i` (which must be the quote). */
function readString(src: string, i: number): { value: string; end: number } | null {
  const q = src[i]
  if (q !== '"' && q !== "'" && q !== '`') return null
  let s = ''
  let j = i + 1
  while (j < src.length && src[j] !== q) {
    if (src[j] === '\\') {
      s += src[j + 1]
      j += 2
    } else {
      s += src[j]
      j++
    }
  }
  return { value: s, end: j + 1 }
}

function skipWs(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i]!)) i++
  return i
}

/**
 * Parse every `server.tool(name, desc, schemaObjectLiteral, handler)` call.
 * Descriptions may be several string literals concatenated with `+`. The schema
 * is always an inline object literal `{ ... }`; we capture its balanced body and
 * pull the top-level `key:` and `...spread` tokens.
 */
function parseManifest(src: string): Map<string, ToolDef> {
  const out = new Map<string, ToolDef>()
  const marker = 'server.tool('
  let at = 0
  while ((at = src.indexOf(marker, at)) !== -1) {
    let i = skipWs(src, at + marker.length)
    const name = readString(src, i)
    if (!name) {
      at += marker.length
      continue
    }
    i = skipWs(src, name.end)
    if (src[i] !== ',') {
      at += marker.length
      continue
    }
    i = skipWs(src, i + 1)

    // Description: one or more string literals joined by `+`.
    let desc = ''
    while (true) {
      const part = readString(src, i)
      if (!part) break
      desc += part.value
      i = skipWs(src, part.end)
      if (src[i] === '+') {
        i = skipWs(src, i + 1)
        continue
      }
      break
    }
    if (src[i] === ',') i = skipWs(src, i + 1)

    // Schema: an inline `{ ... }` object literal — capture top-level keys.
    const schemaKeys: string[] = []
    if (src[i] === '{') {
      let depth = 0
      let j = i
      let inStr: string | null = null
      const topTokens: string[] = []
      let buf = ''
      for (; j < src.length; j++) {
        const c = src[j]!
        if (inStr) {
          if (c === '\\') {
            j++
          } else if (c === inStr) {
            inStr = null
          }
          continue
        }
        if (c === '"' || c === "'" || c === '`') {
          inStr = c
          continue
        }
        if (c === '{' || c === '(' || c === '[') {
          depth++
          if (depth === 1) buf = ''
          continue
        }
        if (c === '}' || c === ')' || c === ']') {
          depth--
          if (depth === 0) {
            topTokens.push(buf)
            break
          }
          continue
        }
        if (depth === 1 && c === ',') {
          topTokens.push(buf)
          buf = ''
          continue
        }
        if (depth === 1) buf += c
      }
      for (const tok of topTokens) {
        const key = tok.match(/^\s*([A-Za-z_$][\w$]*)\s*:/)
        if (key) {
          schemaKeys.push(key[1]!)
          continue
        }
        const spread = tok.match(/^\s*\.\.\.\s*([A-Za-z_$][\w$]*)/)
        if (spread) schemaKeys.push('...' + spread[1]!)
      }
    }

    out.set(name.value, {
      name: name.value,
      desc: desc.replace(/\s+/g, ' ').trim(),
      schemaKeys: schemaKeys.sort(),
    })
    at = i
  }
  return out
}

test.group('MCP manifest sync | drift guard', () => {
  test('the two tool manifests expose the same tool names', async ({ assert }) => {
    const inApp = parseManifest(await readFile(app.makePath(IN_APP), 'utf8'))
    const stdio = parseManifest(await readFile(app.makePath(STDIO), 'utf8'))
    assert.isAbove(inApp.size, 60, 'parser should find every tool (got too few — did the shape change?)')

    const onlyInApp = [...inApp.keys()].filter((n) => !stdio.has(n)).sort()
    const onlyStdio = [...stdio.keys()].filter((n) => !inApp.has(n)).sort()
    assert.deepEqual(onlyInApp, [], `tools only in ${IN_APP} — add them to the stdio manifest`)
    assert.deepEqual(onlyStdio, [], `tools only in ${STDIO} — add them to the in-app manifest`)
  })

  test('every tool has the same description in both manifests', async ({ assert }) => {
    const inApp = parseManifest(await readFile(app.makePath(IN_APP), 'utf8'))
    const stdio = parseManifest(await readFile(app.makePath(STDIO), 'utf8'))
    const drifted: string[] = []
    for (const [name, a] of inApp) {
      const b = stdio.get(name)
      if (b && a.desc !== b.desc) drifted.push(name)
    }
    assert.deepEqual(
      drifted,
      [],
      `description drift between the manifests (edit BOTH): ${drifted.join(', ')}`
    )
  })

  test('every tool has the same top-level schema fields in both manifests', async ({ assert }) => {
    const inApp = parseManifest(await readFile(app.makePath(IN_APP), 'utf8'))
    const stdio = parseManifest(await readFile(app.makePath(STDIO), 'utf8'))
    const drifted: string[] = []
    for (const [name, a] of inApp) {
      const b = stdio.get(name)
      if (b && JSON.stringify(a.schemaKeys) !== JSON.stringify(b.schemaKeys)) {
        drifted.push(`${name} (in-app: [${a.schemaKeys}] vs stdio: [${b.schemaKeys}])`)
      }
    }
    assert.deepEqual(drifted, [], `schema field drift between the manifests (edit BOTH):\n${drifted.join('\n')}`)
  })
})

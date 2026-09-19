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
 * and the same top-level SCHEMA field keys per tool. It also compares every
 * nested `.describe('…')` text (a field's guidance lives there, not in the tool
 * description) per tool block, the shared schema fragments declared above the
 * first tool (`PageMeta`, `SeoSchema`, …) and `SERVER_INSTRUCTIONS`. It scans the
 * source (the two packages can't be co-imported without side effects) — the same
 * parse that the manifests were verified with by hand.
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

const norm = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * Every `.describe(<string literal>)` text in a chunk of source, whitespace
 * normalised, in source order. The argument may be several literals joined by
 * `+`; a `describe(someConstant)` (no literal) is skipped.
 */
function extractDescribes(src: string): string[] {
  const out: string[] = []
  const marker = '.describe('
  let at = 0
  while ((at = src.indexOf(marker, at)) !== -1) {
    let i = skipWs(src, at + marker.length)
    let text = ''
    let found = false
    while (true) {
      const part = readString(src, i)
      if (!part) break
      found = true
      text += part.value
      i = skipWs(src, part.end)
      if (src[i] === '+') {
        i = skipWs(src, i + 1)
        continue
      }
      break
    }
    if (found) out.push(norm(text))
    at += marker.length
  }
  return out
}

/**
 * Index just past the `)` that closes the call whose `(` is at `open`, skipping
 * string literals and comments. Returns -1 when unbalanced.
 */
function closeOfCall(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const c = src[i]!
    if (c === '"' || c === "'" || c === '`') {
      const lit = readString(src, i)
      if (!lit) return -1
      i = lit.end - 1
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '/' && src[i + 1] === '*') {
      const stop = src.indexOf('*/', i + 2)
      if (stop === -1) return -1
      i = stop + 1
    } else if (c === '(') {
      depth++
    } else if (c === ')') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/**
 * The exact source text of each `server.tool(…)` call, keyed by tool name. `''`
 * holds everything OUTSIDE the tool calls — the shared schema fragments
 * (`PageMeta`, `SeoSchema`, `autoResponsiveField`, …) declared between them.
 */
function splitToolBlocks(src: string): Map<string, string> {
  const marker = 'server.tool('
  const blocks = new Map<string, string>()
  let shared = ''
  let cursor = 0
  let at = 0
  while ((at = src.indexOf(marker, at)) !== -1) {
    const name = readString(src, skipWs(src, at + marker.length))
    const end = name ? closeOfCall(src, at + marker.length - 1) : -1
    if (!name || end === -1) {
      at += marker.length
      continue
    }
    shared += src.slice(cursor, at) + '\n'
    blocks.set(name.value, src.slice(at, end))
    cursor = end
    at = end
  }
  blocks.set('', shared + src.slice(cursor))
  return blocks
}

/** `SERVER_INSTRUCTIONS`, the big guidance template literal, whitespace normalised. */
function serverInstructions(src: string): string {
  const decl = src.indexOf('SERVER_INSTRUCTIONS =')
  const tick = decl === -1 ? -1 : src.indexOf('`', decl)
  const lit = tick === -1 ? null : readString(src, tick)
  return lit ? norm(lit.value) : ''
}

/**
 * Names of the tools (and `''` = shared preamble) whose nested `.describe(…)`
 * texts differ between two manifest sources. Order-insensitive inside the shared
 * preamble (fragments may be declared in another order), order-sensitive per tool.
 */
function describeDrift(a: string, b: string): string[] {
  const blocksA = splitToolBlocks(a)
  const blocksB = splitToolBlocks(b)
  const drifted: string[] = []
  for (const name of new Set([...blocksA.keys(), ...blocksB.keys()])) {
    const da = extractDescribes(blocksA.get(name) ?? '')
    const db = extractDescribes(blocksB.get(name) ?? '')
    const same =
      name === ''
        ? JSON.stringify([...da].sort()) === JSON.stringify([...db].sort())
        : JSON.stringify(da) === JSON.stringify(db)
    if (!same) drifted.push(name === '' ? '(shared schema fragments)' : name)
  }
  return drifted.sort()
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

  test('every nested .describe() text matches in both manifests', async ({ assert }) => {
    const a = await readFile(app.makePath(IN_APP), 'utf8')
    const b = await readFile(app.makePath(STDIO), 'utf8')
    const blocks = splitToolBlocks(a)
    assert.isAbove(blocks.size, 60, 'the splitter should find every tool block')
    assert.isAbove(extractDescribes(a).length, 100, 'the describe scan should find the field docs')
    assert.deepEqual(
      describeDrift(a, b),
      [],
      'nested .describe() drift between the manifests (edit BOTH)'
    )
  })

  test('SERVER_INSTRUCTIONS is identical in both manifests', async ({ assert }) => {
    const a = serverInstructions(await readFile(app.makePath(IN_APP), 'utf8'))
    const b = serverInstructions(await readFile(app.makePath(STDIO), 'utf8'))
    assert.isAbove(a.length, 1000, 'should read the whole guidance string')
    assert.equal(a, b, 'SERVER_INSTRUCTIONS drift between the manifests (edit BOTH)')
  })

  test('the drift check itself catches a nested describe that was edited in one copy', async ({
    assert,
  }) => {
    const a = await readFile(app.makePath(IN_APP), 'utf8')
    const b = await readFile(app.makePath(STDIO), 'utf8')
    assert.deepEqual(describeDrift(a, b), [])

    // In-memory scratch copies — the repo files are never touched.
    const needle = 'Same rules as create_collection; null clears.'
    assert.include(b, needle)
    const brokenTool = b.replace(needle, 'Same rules as create_collection; null clears it.')
    assert.deepEqual(describeDrift(a, brokenTool), ['update_collection'])

    // A field doc in the shared fragments (declared above the first tool).
    const canonical = 'the blog index or a post URL'
    assert.include(b, canonical)
    const brokenShared = b.replace(canonical, 'the blog index')
    assert.includeMembers(describeDrift(a, brokenShared), ['(shared schema fragments)'])

    // Whitespace-only differences are not drift.
    assert.deepEqual(describeDrift(a, b.replace(needle, needle.replace(/ /g, '  '))), [])

    // SERVER_INSTRUCTIONS drift is caught too.
    const brokenInstr = b.replace('PAGE TYPE FIRST', 'PAGE KIND FIRST')
    assert.notEqual(serverInstructions(a), serverInstructions(brokenInstr))
  })
})

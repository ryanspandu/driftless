import { test } from '@japa/runner'
import { sanitizeBreakpoints } from '#services/settings_service'

/**
 * The server (`sanitizeBreakpoints`) and client (`readBreakpoints`) each
 * independently sanitize the stored breakpoint list. They MUST produce the same
 * result for the same array input, or a page renders one tier set on the server
 * and another in the builder. This guards that agreement.
 *
 * The client module is imported through a computed specifier so the server-side
 * `tsc` project doesn't try to resolve inertia's build output (TS6305) — the
 * node test loader resolves it fine at runtime.
 */
const CLIENT_MODULE = ['..', '..', 'inertia', 'puck', 'breakpoints.js'].join('/')
async function loadReadBreakpoints(): Promise<(raw: unknown) => unknown[]> {
  const mod = (await import(CLIENT_MODULE)) as { readBreakpoints: (raw: unknown) => unknown[] }
  return mod.readBreakpoints
}

const CASES: unknown[] = [
  [],
  [{ id: 'desktop', label: 'Desktop', maxWidth: null }],
  [
    { id: 'mobile', label: 'Mobile', maxWidth: 390 },
    { id: 'tablet', label: 'Tablet', maxWidth: 768 },
  ],
  // No base tier present → both must synthesize the same base and order it first.
  [
    { id: 'tablet', label: 'Tablet', maxWidth: 768 },
    { id: 'mobile', label: 'Mobile', maxWidth: 390 },
  ],
  // Duplicate ids, an invalid id, out-of-range widths, a widthed "desktop".
  [
    { id: 'desktop', label: 'Desktop', maxWidth: 1200 },
    { id: 'a b', maxWidth: 500 },
    { id: 'tablet', maxWidth: 999999 },
    { id: 'tablet', maxWidth: 700 },
    { id: 'mobile', maxWidth: 10 },
  ],
  // More than the cap (12) valid tiers — both keep the same first 12 + base.
  Array.from({ length: 20 }, (_, i) => ({ id: `bp${i}`, maxWidth: 300 + i })),
]

test.group('Breakpoints | server/client drift', () => {
  for (const [i, input] of CASES.entries()) {
    test(`case ${i} sanitizes identically`, async ({ assert }) => {
      const readBreakpoints = await loadReadBreakpoints()
      assert.deepEqual(sanitizeBreakpoints(input), readBreakpoints(input))
    })
  }
})

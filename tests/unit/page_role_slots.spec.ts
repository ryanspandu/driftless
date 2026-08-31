import { test } from '@japa/runner'
import '@japa/assert'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PAGE_ROLE_SLOTS } from '#services/page_role_slots'

/**
 * The role-slot list is the single source of truth on the server, mirrored for
 * presentation in `inertia/types/api.ts` (`PAGE_ROLE_SLOTS`). Server (`#…`) and
 * client (Vite `~/`) cannot share a runtime module, so this guards the mirror by
 * asserting every server `(section, key)` literal appears in the client file. A
 * new slot added on one side but not the other fails here rather than silently
 * making a Pages-dashboard role write to a key nothing reads.
 */
test.group('Page role slots — server/client mirror', () => {
  test('every server slot section+key appears in the client mirror', async ({ assert }) => {
    const client = await readFile(join(process.cwd(), 'inertia/types/api.ts'), 'utf-8')
    for (const slot of PAGE_ROLE_SLOTS) {
      assert.include(client, `'${slot.key}'`, `client mirror is missing key '${slot.key}'`)
      assert.include(client, `'${slot.section}'`, `client mirror is missing section '${slot.section}'`)
    }
  })

  test('slot list holds exactly the seven expected roles, home first', ({ assert }) => {
    assert.deepEqual(
      PAGE_ROLE_SLOTS.map((s) => s.slot),
      ['home', 'login', 'register', 'forgotPassword', 'resetPassword', 'notFound', 'serverError']
    )
  })
})

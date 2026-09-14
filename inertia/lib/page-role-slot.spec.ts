import { test } from '@japa/runner'
import '@japa/assert'
// Relative import with `.js` (repo convention; the `~/` alias is Vite-only
// and hangs the Node runner — see inertia/lib/offline/sync-clobber.spec.ts).
import { resolveCoreRoleSlot } from './page-role-slot.js'

test.group('resolveCoreRoleSlot', () => {
  test('finds the slot a page id is assigned to', ({ assert }) => {
    const sections = {
      content_pages: { post_detail_page_id: 'page-1', posts_archive_page_id: 'page-2' },
    }
    assert.equal(resolveCoreRoleSlot('page-1', sections), 'postDetail')
    assert.equal(resolveCoreRoleSlot('page-2', sections), 'postsArchive')
  })

  test('returns null for an unassigned page id', ({ assert }) => {
    const sections = { content_pages: { post_detail_page_id: 'page-1' } }
    assert.isNull(resolveCoreRoleSlot('page-999', sections))
  })

  test('returns null when sections is undefined (settings still loading)', ({ assert }) => {
    assert.isNull(resolveCoreRoleSlot('page-1', undefined))
  })
})

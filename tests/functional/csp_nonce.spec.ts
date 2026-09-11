import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import Page from '#models/page'
import { newUlid } from '#services/ulid_service'
import { currentBuildId } from '#services/release'
import { CSP_NONCE_SENTINEL } from '#services/page_renderer'

/**
 * The SSG snapshot serve path re-nonces its frozen HTML per request.
 *
 * A snapshot is rendered once with that request's nonce and re-served verbatim,
 * but Shield sets a FRESH nonce in each response's CSP header — so the render-time
 * nonce is stored as a sentinel and swapped back to the live nonce on serve. This
 * keeps every nonced `<style>`/`<script>` in the snapshot matching the header, so
 * the strict `style-src 'self' 'nonce-…'` never drops them on a cache hit.
 */
test.group('SSG snapshot CSP nonce restamp', (group) => {
  group.each.setup(async () => {
    const cleanup = await testUtils.db().truncate()
    await testUtils.db().seed()
    return cleanup
  })

  test('serving a snapshot swaps the sentinel for the request nonce that matches the CSP header', async ({
    client,
    assert,
  }) => {
    const html =
      `<!DOCTYPE html><html><head>` +
      `<meta name="csp-nonce" content="${CSP_NONCE_SENTINEL}"></head><body>` +
      `<style nonce="${CSP_NONCE_SENTINEL}">[data-b="x"]:hover{color:red}</style>` +
      `</body></html>`

    await Page.create({
      id: newUlid(),
      title: 'CSP nonce SSG page',
      path: 'csp-nonce-ssg',
      status: 'PUBLISHED',
      renderMode: 'SSG',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
      renderedHtml: html,
      // Matches the serve guard `renderedBuild === currentBuildId()` (null in tests).
      renderedBuild: currentBuildId(),
    } as never)

    // Full page load (no x-inertia) hits the snapshot serve branch.
    const res = await client.get('/csp-nonce-ssg')
    res.assertStatus(200)
    const body = res.text()

    // The frozen sentinel must be gone — every occurrence re-nonced.
    assert.notInclude(body, CSP_NONCE_SENTINEL)

    // The nonce stamped in equals the one Shield put in this response's CSP header.
    const csp = res.header('content-security-policy') ?? ''
    const match = csp.match(/'nonce-([^']+)'/)
    assert.isNotNull(match, 'CSP header carries a nonce')
    const nonce = match![1]
    assert.include(body, `content="${nonce}"`)
    assert.include(body, `nonce="${nonce}"`)
  })

  test('a published page nonces the Box interaction-state <style> it renders', async ({
    client,
    assert,
  }) => {
    await Page.create({
      id: newUlid(),
      title: 'CSP nonce hover page',
      path: 'csp-nonce-hover',
      status: 'PUBLISHED',
      renderMode: 'SSR',
      kind: 'BUILDER',
      content: {
        root: {},
        content: [
          {
            type: 'DivBlock',
            props: {
              id: 'CspHoverBox',
              bg: '#00ff00',
              width: '80px',
              height: '80px',
              states: { hover: { bg: '#ff0000' } },
            },
          },
        ],
      },
      seo: {},
    } as never)

    const res = await client.get('/csp-nonce-hover')
    res.assertStatus(200)
    const body = res.text()
    const nonce = (res.header('content-security-policy') ?? '').match(/'nonce-([^']+)'/)?.[1]
    assert.isString(nonce)
    // The generated `:hover` stylesheet is present AND carries the request nonce.
    assert.include(body, '[data-b="CspHoverBox"]:hover')
    assert.include(body, `<style nonce="${nonce}"`)
  })

  test('a snapshot with no nonce material is served unchanged', async ({ client, assert }) => {
    const html = '<!DOCTYPE html><html><body><p>plain</p></body></html>'
    await Page.create({
      id: newUlid(),
      title: 'CSP nonce plain page',
      path: 'csp-nonce-plain',
      status: 'PUBLISHED',
      renderMode: 'SSG',
      kind: 'BUILDER',
      content: { root: {}, content: [] },
      seo: {},
      renderedHtml: html,
      renderedBuild: currentBuildId(),
    } as never)

    const res = await client.get('/csp-nonce-plain')
    res.assertStatus(200)
    assert.include(res.text(), '<p>plain</p>')
  })
})

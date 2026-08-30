import { test } from '@japa/runner'
import {
  sanitizeEmbedHtml,
  sanitizePuckDocument,
  sanitizeRichText,
  sanitizeSvg,
} from '#services/html_sanitizer_service'

test.group('Security sanitizers', () => {
  test('strips executable rich text while retaining normal formatting', ({ assert }) => {
    const clean = sanitizeRichText('<p><strong>Hello</strong><img src=x onerror=alert(1)><a href="javascript:alert(1)">bad</a></p>')
    assert.include(clean, '<strong>Hello</strong>')
    assert.notInclude(clean, 'onerror')
    assert.notInclude(clean, 'javascript:')
  })

  test('keeps only approved HTTPS iframe providers in CodeEmbed', ({ assert }) => {
    const clean = sanitizeEmbedHtml('<script>alert(1)</script><iframe src="https://www.youtube.com/embed/x"></iframe><iframe src="https://evil.example/x"></iframe>')
    assert.include(clean, 'www.youtube.com')
    assert.notInclude(clean, '<script')
    assert.notInclude(clean, 'evil.example')
  })

  test('removes active SVG features and allows static paths', ({ assert }) => {
    const stripped = sanitizeSvg('<svg><script>alert(1)</script></svg>')
    assert.isNotNull(stripped)
    assert.notInclude(stripped!, '<script')
    const clean = sanitizeSvg('<svg viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#000" /></svg>')
    assert.isNotNull(clean)
    assert.include(clean!, '<path')
  })

  test('sanitizes rich text and embeds recursively in Puck documents', ({ assert }) => {
    const doc = sanitizePuckDocument({
      content: [
        { type: 'RichText', props: { html: '<img src=x onerror=alert(1)>' } },
        { type: 'CodeEmbed', props: { html: '<script>alert(1)</script>' } },
      ],
      root: {},
    })
    assert.notInclude(JSON.stringify(doc), 'onerror')
    assert.notInclude(JSON.stringify(doc), '<script')
  })
})

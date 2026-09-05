import { test } from '@japa/runner'
import { validatePuckDocument } from '#modules/mcp/services/puck_content_validator'

/**
 * The validator's image pass: a placeholder/stock host is a hard issue (blocks
 * publish), any other external URL is a non-blocking warning, and self-hosted /
 * relative URLs pass clean. Also walks a Section's `backgrounds` image layers.
 */
function page(content: unknown) {
  return { root: { props: {} }, content }
}

test.group('MCP validator | image URLs', () => {
  test('a placeholder host in an Image src is a hard issue', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([{ type: 'Image', props: { src: 'https://picsum.photos/1200/800' } }]),
      'page'
    )
    assert.isFalse(res.valid)
    assert.isTrue(res.issues.some((i) => /placeholder|picsum/i.test(i.message)))
  })

  test('a placeholder host in a Section backgrounds layer is a hard issue', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([
        {
          type: 'Section',
          props: {
            backgrounds: [
              { type: 'overlay', color: 'rgba(0,0,0,0.4)' },
              { type: 'image', url: 'https://loremflickr.com/1600/900/furniture' },
            ],
            content: [],
          },
        },
      ]),
      'page'
    )
    assert.isFalse(res.valid)
    assert.isTrue(res.issues.some((i) => /backgrounds/i.test(i.path)))
  })

  test('an external CDN URL is a warning, not an error', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([{ type: 'Image', props: { src: 'https://cdn.example.com/hero.jpg' } }]),
      'page'
    )
    assert.isTrue(res.valid)
    assert.isTrue(res.warnings.some((w) => /external URL/i.test(w.message)))
  })

  test('a self-hosted / relative URL passes clean', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([
        { type: 'Image', props: { src: '/uploads/01ABC.jpg' } },
        { type: 'Image', props: { src: { url: '/media/01XYZ.webp', width: 800, height: 600 } } },
      ]),
      'page'
    )
    assert.isTrue(res.valid)
    assert.lengthOf(res.warnings, 0)
  })

  test('an empty Image src is a warning', async ({ assert }) => {
    const res = await validatePuckDocument(
      page([{ type: 'Image', props: { src: '' } }]),
      'page'
    )
    assert.isTrue(res.valid)
    assert.isTrue(res.warnings.some((w) => /empty/i.test(w.message)))
  })
})

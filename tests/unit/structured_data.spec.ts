import { test } from '@japa/runner'
import { buildJsonLd } from '#services/structured_data_service'

test.group('Structured data (JSON-LD)', () => {
  test('builds a WebPage + BreadcrumbList for an ordinary page', ({ assert }) => {
    const out = buildJsonLd({
      url: 'https://example.com/about/team',
      title: 'Our Team',
      description: 'Meet us',
      siteName: 'Acme',
      isHome: false,
      path: 'about/team',
    })
    assert.isString(out)
    const parsed = JSON.parse(out!) as Array<Record<string, unknown>>
    const types = parsed.map((n) => n['@type'])
    assert.include(types, 'WebPage')
    assert.include(types, 'BreadcrumbList')
    // Home is not an Organization here.
    assert.notInclude(types, 'Organization')

    const crumb = parsed.find((n) => n['@type'] === 'BreadcrumbList')!
    const list = crumb.itemListElement as Array<{ name: string; position: number }>
    // Home + about + team.
    assert.lengthOf(list, 3)
    assert.equal(list[0]!.name, 'Home')
    assert.equal(list[2]!.name, 'Team') // humanised last segment
  })

  test('emits Organization + WebSite on the home page', ({ assert }) => {
    const out = buildJsonLd({
      url: 'https://example.com/',
      title: 'Home',
      siteName: 'Acme',
      logoUrl: '/logo.svg',
      isHome: true,
      path: '',
    })
    const parsed = JSON.parse(out!) as Array<Record<string, unknown>>
    const types = parsed.map((n) => n['@type'])
    assert.include(types, 'Organization')
    assert.include(types, 'WebSite')
    const org = parsed.find((n) => n['@type'] === 'Organization')!
    assert.match(String(org.logo), /\/logo\.svg$/)
  })

  test('a valid custom object replaces the auto graph', ({ assert }) => {
    const custom = '{"@context":"https://schema.org","@type":"FAQPage","name":"Q"}'
    const out = buildJsonLd({
      url: 'https://example.com/faq',
      title: 'FAQ',
      siteName: 'Acme',
      isHome: false,
      path: 'faq',
      custom,
    })
    const parsed = JSON.parse(out!) as Record<string, unknown>
    assert.equal(parsed['@type'], 'FAQPage')
  })

  test('invalid custom JSON falls back to the auto graph', ({ assert }) => {
    const out = buildJsonLd({
      url: 'https://example.com/x',
      title: 'X',
      siteName: 'Acme',
      isHome: false,
      path: 'x',
      custom: '{not json',
    })
    const parsed = JSON.parse(out!) as Array<Record<string, unknown>> | Record<string, unknown>
    const nodes = Array.isArray(parsed) ? parsed : [parsed]
    assert.isTrue(nodes.some((n) => n['@type'] === 'WebPage'))
  })

  test('escapes a </script> sequence so it cannot break out of the tag', ({ assert }) => {
    const out = buildJsonLd({
      url: 'https://example.com/x',
      title: 'Hi </script><script>alert(1)</script>',
      siteName: 'Acme',
      isHome: false,
      path: 'x',
    })
    assert.notInclude(out!, '</script>')
  })

  test('spreads module-contributed extra nodes (e.g. Product)', ({ assert }) => {
    const out = buildJsonLd({
      url: 'https://example.com/shop/p/widget',
      title: 'Widget',
      siteName: 'Acme',
      isHome: false,
      path: 'shop/p/widget',
      extra: [{ '@context': 'https://schema.org', '@type': 'Product', 'name': 'Widget' }],
    })
    const parsed = JSON.parse(out!) as Array<Record<string, unknown>>
    assert.include(
      parsed.map((n) => n['@type']),
      'Product'
    )
  })
})

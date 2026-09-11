import { test } from '@japa/runner'
import { WebSettingsService } from '#services/settings_service'

const svc = new WebSettingsService()

test.group('mapPublicTheme saved colours', () => {
  test('parses + sanitises saved_colors, dropping invalid and duplicate entries', ({ assert }) => {
    const sections = {
      theme: {
        primary_color: '#5225e6',
        secondary_color: '',
        saved_colors: JSON.stringify([
          { slug: 'brand', name: 'Brand', value: '#10b981' },
          { slug: 'bad slug!', name: 'X', value: '#ffffff' }, // invalid slug → dropped
          { slug: 'brand', name: 'Dup', value: '#000000' }, // duplicate slug → dropped
          { slug: 'noval', name: 'No value', value: 'not-a-color' }, // invalid value → dropped
          { slug: 'alpha', name: 'Alpha', value: 'rgba(0, 0, 0, 0.5)' }, // rgba allowed
        ]),
      },
    }
    const theme = svc.mapPublicTheme(sections as never)
    assert.equal(theme.primaryColor, '#5225e6')
    assert.deepEqual(theme.savedColors, [
      { slug: 'brand', name: 'Brand', value: '#10b981' },
      { slug: 'alpha', name: 'Alpha', value: 'rgba(0, 0, 0, 0.5)' },
    ])
  })

  test('empty / absent / malformed saved_colors → empty array', ({ assert }) => {
    assert.deepEqual(svc.mapPublicTheme({ theme: {} } as never).savedColors, [])
    assert.deepEqual(svc.mapPublicTheme({} as never).savedColors, [])
    assert.deepEqual(
      svc.mapPublicTheme({ theme: { saved_colors: 'not json' } } as never).savedColors,
      []
    )
  })

  test('a slug missing a name falls back to the slug', ({ assert }) => {
    const sections = {
      theme: { saved_colors: JSON.stringify([{ slug: 'ink', name: '', value: '#111111' }]) },
    }
    assert.deepEqual(svc.mapPublicTheme(sections as never).savedColors, [
      { slug: 'ink', name: 'ink', value: '#111111' },
    ])
  })
})

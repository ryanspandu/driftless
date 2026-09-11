import { test } from '@japa/runner'
import '@japa/assert'
/**
 * Relative import with `.js`, not the `~/puck` alias — that alias only exists in
 * `vite.config.ts` / `tsconfig.inertia.json`, and Node's resolver (which runs
 * this suite) knows nothing about it. See `inertia/lib/api-discriminator.spec.ts`.
 */
import { scrollAnimationAttrs } from './scroll-animation.js'

test.group('scrollAnimationAttrs', () => {
  test('emits nothing when no animation is configured', ({ assert }) => {
    assert.deepEqual(scrollAnimationAttrs({}, false), { attrs: {}, vars: {} })
    assert.deepEqual(scrollAnimationAttrs({ scrollAnimation: {} }, false), { attrs: {}, vars: {} })
  })

  test('emits nothing for an unknown preset', ({ assert }) => {
    const out = scrollAnimationAttrs({ scrollAnimation: { type: 'wobble' } }, false)
    assert.deepEqual(out, { attrs: {}, vars: {} })
  })

  test('is suppressed while editing even with a valid preset', ({ assert }) => {
    const out = scrollAnimationAttrs({ scrollAnimation: { type: 'fade-up' } }, true)
    assert.deepEqual(out, { attrs: {}, vars: {} })
  })

  test('emits the preset data-attribute and defaults to play-once', ({ assert }) => {
    const out = scrollAnimationAttrs({ scrollAnimation: { type: 'fade-up' } }, false)
    assert.equal(out.attrs['data-scroll-animation'], 'fade-up')
    assert.equal(out.attrs['data-sa-once'], 'true')
  })

  test('opts into replay when once is false', ({ assert }) => {
    const out = scrollAnimationAttrs({ scrollAnimation: { type: 'fade', once: false } }, false)
    assert.equal(out.attrs['data-sa-once'], 'false')
  })

  test('maps timing options to inert CSS custom properties', ({ assert }) => {
    const out = scrollAnimationAttrs(
      {
        scrollAnimation: {
          type: 'zoom-in',
          duration: '800ms',
          delay: '100ms',
          easing: 'ease-out',
          distance: '40px',
          threshold: '25%',
        },
      },
      false
    )
    assert.deepEqual(out.vars, {
      '--sa-duration': '800ms',
      '--sa-delay': '100ms',
      '--sa-easing': 'ease-out',
      '--sa-distance': '40px',
    })
    assert.equal(out.attrs['data-sa-threshold'], '25%')
  })

  test('never emits opacity or transform (SSR/no-JS must stay visible)', ({ assert }) => {
    const out = scrollAnimationAttrs({ scrollAnimation: { type: 'flip' } }, false)
    assert.notProperty(out.vars, 'opacity')
    assert.notProperty(out.vars, 'transform')
  })
})

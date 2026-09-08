import { useEffect } from 'react'

/**
 * The static site's vanilla JS, ported to React effects.
 *
 * The markup keeps the source's classes / ids / `data-*` hooks, and these
 * effects wire the same behaviour to it after render — with proper cleanup, so
 * they survive React's dev double-invoke and HMR. Each is a no-op when its
 * target elements are absent, so a page calls only the sets it needs.
 */

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Scroll-reveal: `[data-reveal]` → `.is-visible` once in view (main.js + portfolio.js). */
export function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (!els.length) return
    const revealAll = () => els.forEach((el) => el.classList.add('is-visible'))
    if (reduced() || !('IntersectionObserver' in window)) {
      revealAll()
      return
    }
    let observerWorked = false
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            observerWorked = true
            const el = entry.target as HTMLElement
            const delay = Math.min(i * 60, 240)
            window.setTimeout(() => el.classList.add('is-visible'), delay)
            io.unobserve(el)
          }
        })
      },
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' }
    )
    els.forEach((el) => io.observe(el))
    // Fallback: if the observer never reports an intersection — e.g. a
    // zero-height viewport in a headless/preview browser — reveal everything so
    // content is never left permanently hidden. A real browser reveals
    // above-the-fold well before this fires, so scroll-reveal is preserved.
    const fallback = window.setTimeout(() => {
      if (!observerWorked) revealAll()
    }, 1200)
    return () => {
      io.disconnect()
      window.clearTimeout(fallback)
    }
  }, [])
}

/** Count-up stats: `[data-count]` animates to its number when scrolled into view. */
export function useCountUp() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-count]'))
    if (!els.length) return

    const render = (el: HTMLElement, value: number) => {
      const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10)
      const suffix = el.getAttribute('data-suffix') || ''
      el.textContent = value.toFixed(decimals) + suffix
    }
    const animate = (el: HTMLElement) => {
      const target = parseFloat(el.getAttribute('data-count') || '0')
      const duration = 1500
      let start: number | null = null
      const ease = (t: number) => 1 - Math.pow(1 - t, 3)
      const frame = (ts: number) => {
        if (start === null) start = ts
        const p = Math.min((ts - start) / duration, 1)
        render(el, target * ease(p))
        if (p < 1) requestAnimationFrame(frame)
        else render(el, target)
      }
      requestAnimationFrame(frame)
    }

    const fill = () => els.forEach((el) => render(el, parseFloat(el.getAttribute('data-count') || '0')))
    if (reduced() || !('IntersectionObserver' in window)) {
      fill()
      return
    }
    let observerWorked = false
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            observerWorked = true
            animate(entry.target as HTMLElement)
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.6 }
    )
    els.forEach((el) => io.observe(el))
    // Same headless/zero-viewport fallback as useReveal: if the observer never
    // fires, just show the final numbers rather than leaving them at 0.
    const fallback = window.setTimeout(() => {
      if (!observerWorked) fill()
    }, 1200)
    return () => {
      io.disconnect()
      window.clearTimeout(fallback)
    }
  }, [])
}

/** `.nav` header: scroll state + mobile hamburger menu (main.js). */
export function useNav() {
  useEffect(() => {
    const nav = document.getElementById('nav')
    const toggle = document.getElementById('navToggle')
    const links = document.getElementById('navLinks')
    if (!nav) return

    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    const closeMenu = () => {
      nav.classList.remove('is-open')
      toggle?.setAttribute('aria-expanded', 'false')
      toggle?.setAttribute('aria-label', 'Open menu')
    }
    const onToggle = () => {
      const open = nav.classList.toggle('is-open')
      toggle?.setAttribute('aria-expanded', String(open))
      toggle?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu')
    }
    const onLinkClick = (e: Event) => {
      if ((e.target as HTMLElement).closest('a')) closeMenu()
    }
    toggle?.addEventListener('click', onToggle)
    links?.addEventListener('click', onLinkClick)

    return () => {
      window.removeEventListener('scroll', onScroll)
      toggle?.removeEventListener('click', onToggle)
      links?.removeEventListener('click', onLinkClick)
    }
  }, [])
}

/** `.pnav` (portfolio) header: scroll state only (portfolio.js). */
export function usePnav() {
  useEffect(() => {
    const pnav = document.getElementById('pnav')
    if (!pnav) return
    const onScroll = () => pnav.classList.toggle('is-scrolled', window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
}

/** Hero pointer-tilt parallax on `.hero__visual` (main.js). Fine-pointer only. */
export function useHeroTilt() {
  useEffect(() => {
    const stage = document.querySelector<HTMLElement>('.hero__visual')
    if (!stage) return
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (reduced() || !finePointer) return

    const photo = stage.querySelector<HTMLElement>('.hero__photo')
    const booking = stage.querySelector<HTMLElement>('.floatcard--booking')
    const chip = stage.querySelector<HTMLElement>('.floatchip--calls')
    const layers: [HTMLElement | null, number, number][] = [
      [photo, 6, 0],
      [booking, 16, 30],
      [chip, 22, 55],
    ]
    let rect: DOMRect | null = null
    let raf = 0
    let px = 0
    let py = 0

    const apply = () => {
      raf = 0
      layers.forEach(([el, strength, popZ]) => {
        if (!el) return
        el.style.transform =
          `translate3d(${(px * strength).toFixed(1)}px,${(py * strength * 0.72).toFixed(1)}px,${popZ}px)` +
          ` rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg)`
      })
    }
    const onMove = (e: PointerEvent) => {
      if (!rect) rect = stage.getBoundingClientRect()
      px = (e.clientX - rect.left) / rect.width - 0.5
      py = (e.clientY - rect.top) / rect.height - 0.5
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onEnter = () => {
      rect = stage.getBoundingClientRect()
      stage.classList.add('is-tilting')
    }
    const onLeave = () => {
      stage.classList.remove('is-tilting')
      rect = null
      layers.forEach(([el]) => {
        if (el) el.style.transform = ''
      })
    }
    const onScroll = () => {
      rect = null
    }
    stage.addEventListener('pointerenter', onEnter)
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerleave', onLeave)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      stage.removeEventListener('pointerenter', onEnter)
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])
}

/** FAQ accordion: native `<details>`, only one open at a time (main.js). */
export function useFaq() {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLDetailsElement>('.faq__item'))
    if (!items.length) return
    const handlers = items.map((item) => {
      const onToggle = () => {
        item.classList.toggle('is-open', item.open)
        if (item.open) items.forEach((other) => other !== item && (other.open = false))
      }
      item.addEventListener('toggle', onToggle)
      return { item, onToggle }
    })
    return () => handlers.forEach(({ item, onToggle }) => item.removeEventListener('toggle', onToggle))
  }, [])
}

/** GEO typing demo: types `[data-type]` into `.aidemo__text`, bolding the business name. */
export function useAiDemo() {
  useEffect(() => {
    const wrap = document.querySelector<HTMLElement>('[data-aidemo]')
    const el = wrap?.querySelector<HTMLElement>('.aidemo__text')
    if (!wrap || !el) return
    const full = el.getAttribute('data-type') || ''
    const name = 'Rapid Plumbing Co.'
    const highlight = (s: string) => s.replace(name, `<b>${name}</b>`)

    if (reduced()) {
      el.innerHTML = highlight(full)
      return
    }
    let started = false
    let timers: number[] = []
    const typeOnce = () => {
      el.textContent = ''
      let i = 0
      const step = () => {
        if (i <= full.length) {
          el.textContent = full.slice(0, i)
          i++
          timers.push(window.setTimeout(step, 26))
        } else {
          el.innerHTML = highlight(full)
          timers.push(window.setTimeout(typeOnce, 4200))
        }
      }
      step()
    }
    let io: IntersectionObserver | null = null
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting && !started) {
              started = true
              typeOnce()
              io?.unobserve(wrap)
            }
          })
        },
        { threshold: 0.4 }
      )
      io.observe(wrap)
    } else {
      typeOnce()
    }
    // Fallback for a headless/zero-viewport browser where the observer never
    // fires: show the final answer (un-typed) rather than an empty line.
    const fallback = window.setTimeout(() => {
      if (!started) {
        started = true
        el.innerHTML = highlight(full)
      }
    }, 1200)
    return () => {
      io?.disconnect()
      window.clearTimeout(fallback)
      timers.forEach((t) => window.clearTimeout(t))
      timers = []
    }
  }, [])
}

/** Everything the landing page (and, minus the hero bits, the insights hub) needs. */
export function useLandingScripts() {
  useNav()
  useReveal()
  useCountUp()
  useHeroTilt()
  useFaq()
  useAiDemo()
}

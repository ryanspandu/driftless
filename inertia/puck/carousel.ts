/**
 * Auto-loop runtime for the `Carousel` block, mirroring `scroll-animation.ts`:
 *
 * - **Published-page only.** Called from `public-page-frame.tsx` (which the editor
 *   never mounts), and keyed off `data-carousel*` attributes the block emits only
 *   when NOT editing. So the builder canvas shows a static, draggable track and
 *   the live page auto-loops.
 * - **No-JS / SSR safe.** Without this runtime the track is just a flex row of
 *   slides (all visible) — nothing is hidden or clipped by JS.
 * - **Reduced motion.** No auto-advance / no marquee; a slide carousel stays
 *   manually navigable via its arrows/dots, a marquee simply stays still.
 * - **Zero dependency.** `requestAnimationFrame` + `transform` only (GPU), so it
 *   keeps ticking even while the main thread is busy.
 *
 * Two modes, chosen per block via `data-carousel="slide" | "marquee"`:
 *   • slide   — shows `--ca-per` slides, advances one every `data-ca-interval`s,
 *               seamless infinite via cloned lead slides; optional arrows/dots.
 *   • marquee — duplicates the slides and scrolls continuously, `data-ca-speed`
 *               seconds per loop; seamless because the set is doubled.
 * Both support pause-on-hover (`data-ca-pause`).
 */

const REDUCED = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function trackGap(track: HTMLElement): number {
  const cs = getComputedStyle(track)
  return Number.parseFloat(cs.columnGap || cs.gap || '0') || 0
}

function initMarquee(viewport: HTMLElement, track: HTMLElement, pause: boolean): () => void {
  const originals = Array.from(track.children) as HTMLElement[]
  if (originals.length === 0) return () => {}

  // Duplicate the set once so the scroll can wrap seamlessly.
  const clones = originals.map((el) => {
    const c = el.cloneNode(true) as HTMLElement
    c.setAttribute('aria-hidden', 'true')
    c.dataset.caClone = '1'
    return c
  })
  clones.forEach((c) => track.appendChild(c))

  const speed = Math.max(1, Number(viewport.dataset.caSpeed) || 20) // seconds per loop
  track.style.willChange = 'transform'

  // Width of ONE set including its trailing gap — the exact wrap distance.
  const measure = () => {
    const gap = trackGap(track)
    return originals.reduce((sum, el) => sum + el.getBoundingClientRect().width + gap, 0)
  }
  let setWidth = measure()
  let x = 0
  let last = 0
  let paused = false
  let raf = 0

  const tick = (now: number) => {
    if (!last) last = now
    const dt = now - last
    last = now
    if (!paused && setWidth > 0) {
      x -= (setWidth / (speed * 1000)) * dt
      if (-x >= setWidth) x += setWidth
      track.style.transform = `translateX(${x}px)`
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const onEnter = () => pause && (paused = true)
  const onLeave = () => (paused = false)
  const onResize = () => (setWidth = measure())
  viewport.addEventListener('mouseenter', onEnter)
  viewport.addEventListener('mouseleave', onLeave)
  window.addEventListener('resize', onResize)

  return () => {
    cancelAnimationFrame(raf)
    viewport.removeEventListener('mouseenter', onEnter)
    viewport.removeEventListener('mouseleave', onLeave)
    window.removeEventListener('resize', onResize)
    track.style.transform = ''
    track.style.willChange = ''
    track.querySelectorAll('[data-ca-clone]').forEach((c) => c.remove())
  }
}

function initSlide(
  viewport: HTMLElement,
  track: HTMLElement,
  reduced: boolean,
  pause: boolean
): () => void {
  const originals = Array.from(track.children) as HTMLElement[]
  const n = originals.length
  if (n === 0) return () => {}

  const intervalMs = Math.max(1, Number(viewport.dataset.caInterval) || 4) * 1000
  const showArrows = viewport.dataset.caArrows !== 'false'
  const showDots = viewport.dataset.caDots !== 'false'
  const per = Math.max(
    1,
    Math.min(n, Number(getComputedStyle(track).getPropertyValue('--ca-per')) || 1)
  )

  // Clone the first `per` slides so advancing past the end lands on a copy of the
  // start, then snap back invisibly for a seamless forward loop.
  const clones: HTMLElement[] = []
  if (n > per) {
    for (let k = 0; k < per; k++) {
      const c = originals[k].cloneNode(true) as HTMLElement
      c.setAttribute('aria-hidden', 'true')
      c.dataset.caClone = '1'
      clones.push(c)
      track.appendChild(c)
    }
  }

  let index = 0
  const stepPx = () => originals[0].getBoundingClientRect().width + trackGap(track)
  const apply = (animate: boolean) => {
    track.style.transition = animate ? 'transform 0.5s ease' : 'none'
    track.style.transform = `translateX(${-index * stepPx()}px)`
  }
  apply(false)

  // Dots (created here so no-JS pages stay clean).
  const cleanups: Array<() => void> = []
  let dotEls: HTMLElement[] = []
  const syncDots = () => {
    const active = ((index % n) + n) % n
    dotEls.forEach((d, i) => d.setAttribute('data-active', i === active ? 'true' : 'false'))
  }
  if (showDots && n > 1) {
    const dots = document.createElement('div')
    dots.className = 'ca-dots'
    for (let i = 0; i < n; i++) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'ca-dot'
      b.setAttribute('aria-label', `Go to slide ${i + 1}`)
      b.addEventListener('click', () => goTo(i))
      dotEls.push(b)
      dots.appendChild(b)
    }
    viewport.appendChild(dots)
    cleanups.push(() => dots.remove())
  }

  const goTo = (i: number) => {
    index = i
    apply(true)
    syncDots()
    restart()
  }
  const next = () => {
    index++
    apply(true)
    syncDots()
    if (index >= n) {
      window.setTimeout(() => {
        index = 0
        apply(false)
      }, 520)
    }
  }
  const prev = () => {
    if (index <= 0) {
      // jump to the mirror end without animation, then step back
      index = n
      apply(false)
      requestAnimationFrame(() => {
        index = n - 1
        apply(true)
      })
    } else {
      index--
      apply(true)
    }
    syncDots()
    restart()
  }

  // Arrows.
  if (showArrows && n > per) {
    const mk = (dir: 'prev' | 'next', label: string, glyph: string) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `ca-arrow ca-arrow-${dir}`
      b.setAttribute('aria-label', label)
      b.textContent = glyph
      b.addEventListener('click', () => (dir === 'next' ? goTo(index + 1) : prev()))
      viewport.appendChild(b)
      cleanups.push(() => b.remove())
    }
    mk('prev', 'Previous slide', '‹')
    mk('next', 'Next slide', '›')
  }

  // Autoplay (skipped under reduced motion — controls still work).
  let timer = 0
  const start = () => {
    if (!reduced && n > per) timer = window.setInterval(next, intervalMs)
  }
  const stop = () => {
    if (timer) {
      window.clearInterval(timer)
      timer = 0
    }
  }
  function restart() {
    stop()
    start()
  }
  start()
  syncDots()

  const onEnter = () => pause && stop()
  const onLeave = () => pause && start()
  const onResize = () => apply(false)
  viewport.addEventListener('mouseenter', onEnter)
  viewport.addEventListener('mouseleave', onLeave)
  window.addEventListener('resize', onResize)

  return () => {
    stop()
    viewport.removeEventListener('mouseenter', onEnter)
    viewport.removeEventListener('mouseleave', onLeave)
    window.removeEventListener('resize', onResize)
    track.style.transform = ''
    track.style.transition = ''
    track.querySelectorAll('[data-ca-clone]').forEach((c) => c.remove())
    cleanups.forEach((c) => c())
  }
}

/** Wire every carousel under `root`. Returns a cleanup. No-op when there are none. */
export function initCarousels(root: HTMLElement): () => void {
  if (typeof window === 'undefined') return () => {}
  const viewports = Array.from(root.querySelectorAll<HTMLElement>('[data-carousel]'))
  if (viewports.length === 0) return () => {}
  const reduced = REDUCED()

  const cleanups: Array<() => void> = []
  for (const viewport of viewports) {
    const track = viewport.querySelector<HTMLElement>('.carousel-track')
    if (!track) continue
    const pause = viewport.dataset.caPause !== 'false'
    if (viewport.dataset.carousel === 'marquee') {
      if (!reduced) cleanups.push(initMarquee(viewport, track, pause))
    } else {
      cleanups.push(initSlide(viewport, track, reduced, pause))
    }
  }
  return () => cleanups.forEach((c) => c())
}

import { useEffect } from 'react'

/**
 * The static site's `insights.js`, ported to React effects.
 *
 * Runs alongside the shared `./use-scripts` hooks (nav, reveal, FAQ, year) that
 * the hub reuses from `main.js`. The markup keeps the source's classes / ids /
 * `data-*` hooks, and these effects wire the same behaviour to it after render —
 * with proper cleanup, so they survive React's dev double-invoke and HMR.
 *
 * The hub and the articles share one bundle, so every block is element-guarded:
 * each is a no-op when its target elements are absent.
 */

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** HUB: category filter — `.ins-tab` toggles `#insGrid .ins-card` by `data-cat`. */
export function useInsightsFilters() {
  useEffect(() => {
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('.ins-tab'))
    const cards = Array.from(document.querySelectorAll<HTMLElement>('#insGrid .ins-card'))
    if (!tabs.length || !cards.length) return

    const handlers = tabs.map((tab) => {
      const onClick = () => {
        tabs.forEach((t) => {
          t.classList.remove('is-active')
          t.setAttribute('aria-selected', 'false')
        })
        tab.classList.add('is-active')
        tab.setAttribute('aria-selected', 'true')
        const f = tab.getAttribute('data-filter')
        cards.forEach((card) => {
          const cats = (card.getAttribute('data-cat') || '').split(' ')
          card.classList.toggle('is-hidden', !(f === 'all' || cats.indexOf(f || '') !== -1))
        })
      }
      tab.addEventListener('click', onClick)
      return { tab, onClick }
    })

    return () => handlers.forEach(({ tab, onClick }) => tab.removeEventListener('click', onClick))
  }, [])
}

/** ARTICLE: reading-progress bar — fills `#insProgress` from `.ins-body` scroll. */
export function useReadingProgress() {
  useEffect(() => {
    const bar = document.getElementById('insProgress')
    const article = document.querySelector<HTMLElement>('.ins-body')
    if (!bar || !article || reduced()) return

    let raf = 0
    const update = () => {
      raf = 0
      const rect = article.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      const passed = -rect.top
      const pct = total > 0 ? Math.min(Math.max(passed / total, 0), 1) : 0
      bar.style.width = (pct * 100).toFixed(2) + '%'
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    update()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
}

/**
 * ARTICLE: build the table of contents from `.ins-body h2[id]` into every
 * `.ins-toc ul` (desktop + mobile clones), then scrollspy-highlight the current
 * section's links via an `IntersectionObserver`.
 */
export function useToc() {
  useEffect(() => {
    const body = document.querySelector<HTMLElement>('.ins-body')
    const tocLists = Array.from(document.querySelectorAll<HTMLElement>('.ins-toc ul'))
    if (!body || !tocLists.length) return
    const heads = Array.from(body.querySelectorAll<HTMLElement>('h2[id]'))
    if (!heads.length) return

    // populate every TOC list (desktop + mobile clones)
    const linkGroups: HTMLAnchorElement[][] = tocLists.map((ul) => {
      ul.innerHTML = ''
      const links: HTMLAnchorElement[] = []
      heads.forEach((h) => {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = '#' + h.id
        a.textContent = h.textContent
        li.appendChild(a)
        ul.appendChild(li)
        links.push(a)
      })
      return links
    })

    const setActive = (id: string | null) => {
      linkGroups.forEach((links) => {
        links.forEach((a) => {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + id)
        })
      })
    }

    if (!('IntersectionObserver' in window)) {
      // no observer support: mark the first section active so the TOC isn't dead
      setActive(heads[0].id)
      return () => {
        tocLists.forEach((ul) => (ul.innerHTML = ''))
      }
    }

    let observerWorked = false
    let current: string | null = null
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            observerWorked = true
            current = (e.target as HTMLElement).id
          }
        })
        setActive(current)
      },
      { rootMargin: '-96px 0px -66% 0px', threshold: 0 }
    )
    heads.forEach((h) => spy.observe(h))
    // Fallback: if the observer never reports an intersection — e.g. a
    // zero-height viewport in a headless/preview browser — highlight the first
    // section so the TOC is never left with nothing active. A real browser
    // resolves the current section well before this fires.
    const fallback = window.setTimeout(() => {
      if (!observerWorked) setActive(heads[0].id)
    }, 1200)

    return () => {
      spy.disconnect()
      window.clearTimeout(fallback)
      tocLists.forEach((ul) => (ul.innerHTML = ''))
    }
  }, [])
}

/** ARTICLE: copy-link share — `#insCopy` copies the page URL, flashing its label. */
export function useCopyLink() {
  useEffect(() => {
    const btn = document.getElementById('insCopy')
    if (!btn) return
    const label = btn.querySelector<HTMLElement>('[data-label]')
    let flash = 0

    const onClick = () => {
      const url = window.location.href.split('#')[0]
      const done = () => {
        if (!label) return
        const old = label.textContent
        label.textContent = 'Link copied'
        flash = window.setTimeout(() => {
          label.textContent = old
        }, 1800)
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, done)
      } else {
        const t = document.createElement('textarea')
        t.value = url
        document.body.appendChild(t)
        t.select()
        try {
          document.execCommand('copy')
        } catch {
          /* ignore */
        }
        document.body.removeChild(t)
        done()
      }
    }
    btn.addEventListener('click', onClick)

    return () => {
      btn.removeEventListener('click', onClick)
      if (flash) window.clearTimeout(flash)
    }
  }, [])
}

/** Everything an insights hub / article page needs from `insights.js`. */
export function useInsightsScripts() {
  useInsightsFilters()
  useReadingProgress()
  useToc()
  useCopyLink()
}

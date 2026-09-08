import { useEffect } from 'react'
import { usePnav, useReveal, useCountUp } from './use-scripts'

/**
 * The static site's `portfolio.js`, ported to React effects.
 *
 * The markup keeps the source's classes / ids / `data-*` hooks, and these
 * effects wire the same behaviour to it after render — with proper cleanup, so
 * they survive React's dev double-invoke and HMR. Each is a no-op when its
 * target elements are absent, so a page calls only the sets it needs.
 *
 * The shared bits `portfolio.js` duplicates from `main.js` — the `#pnav`
 * scroll state (`usePnav`), `[data-reveal]` scroll-reveal (`useReveal`), and
 * `[data-count]` count-up (`useCountUp`) — are reused from `./use-scripts`
 * rather than re-implemented; only the portfolio-specific behaviours live here.
 */

const reduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Portfolio filter tabs: `.pf-tab` toggles `#pgrid .pcard` by `data-cat`.
 * Each pill's `.pf-tab__n` count and the `#workCount` total are derived from
 * the DOM so they never drift from the markup.
 */
export function usePortfolioFilters() {
  useEffect(() => {
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('.pf-tab'))
    const cards = Array.from(document.querySelectorAll<HTMLElement>('#pgrid .pcard'))
    if (!tabs.length || !cards.length) return
    const countEl = document.getElementById('workCount')

    const catsOf = (el: HTMLElement) => (el.getAttribute('data-cat') || '').split(' ')
    const updateCount = () => {
      if (!countEl) return
      const n = cards.filter((c) => !c.classList.contains('is-hidden')).length
      countEl.textContent = n + (n === 1 ? ' project' : ' projects')
    }

    // per-filter counts inside each pill, derived from the DOM so they never drift
    tabs.forEach((tab) => {
      const f = tab.getAttribute('data-filter')
      const n = cards.filter((c) => f === 'all' || catsOf(c).indexOf(f || '') !== -1).length
      const nEl = tab.querySelector<HTMLElement>('.pf-tab__n')
      if (nEl) nEl.textContent = String(n)
    })

    const handlers = tabs.map((tab) => {
      const onClick = () => {
        tabs.forEach((t) => t.classList.remove('is-active'))
        tab.classList.add('is-active')
        const f = tab.getAttribute('data-filter')
        cards.forEach((card) => {
          const show = f === 'all' || catsOf(card).indexOf(f || '') !== -1
          card.classList.toggle('is-hidden', !show)
        })
        updateCount()
      }
      tab.addEventListener('click', onClick)
      return { tab, onClick }
    })
    updateCount()

    return () => handlers.forEach(({ tab, onClick }) => tab.removeEventListener('click', onClick))
  }, [])
}

/**
 * Hero fanned-deck pointer parallax: tilt one wrapper (`.phero__tilt`) in 3D
 * inside `.phero__fan`; each card keeps its own fan transform. `preserve-3d`
 * plus per-card `translateZ` gives free per-layer parallax. Fine-pointer only.
 */
export function usePheroParallax() {
  useEffect(() => {
    const fan = document.querySelector<HTMLElement>('.phero__fan')
    const tiltEl = fan?.querySelector<HTMLElement>('.phero__tilt')
    if (!fan || !tiltEl) return
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    if (reduced() || !finePointer) return

    let rect: DOMRect | null = null
    let raf = 0
    let px = 0
    let py = 0
    let restoreTimer = 0

    const apply = () => {
      raf = 0
      tiltEl.style.transform =
        `translate3d(${(px * 12).toFixed(1)}px,${(py * 8).toFixed(1)}px,0)` +
        ` rotateX(${(-py * 6.5).toFixed(2)}deg) rotateY(${(px * 10).toFixed(2)}deg)`
    }
    const onMove = (e: PointerEvent) => {
      if (!rect) rect = fan.getBoundingClientRect()
      px = (e.clientX - rect.left) / rect.width - 0.5
      py = (e.clientY - rect.top) / rect.height - 0.5
      if (!raf) raf = requestAnimationFrame(apply)
      if (restoreTimer) {
        window.clearTimeout(restoreTimer)
        restoreTimer = 0
      }
      // auto-cursor yields once the real pointer takes over
      if (!fan.classList.contains('is-userknown')) fan.classList.add('is-userknown')
    }
    const onEnter = () => {
      rect = fan.getBoundingClientRect()
      if (restoreTimer) {
        window.clearTimeout(restoreTimer)
        restoreTimer = 0
      }
      fan.classList.add('is-tilting')
    }
    const onLeave = () => {
      fan.classList.remove('is-tilting')
      rect = null
      tiltEl.style.transform = ''
      // bring the demo cursor back a moment after the real cursor leaves (ignore quick out-and-in)
      restoreTimer = window.setTimeout(() => fan.classList.remove('is-userknown'), 700)
    }
    const onScroll = () => {
      rect = null
    }

    fan.addEventListener('pointerenter', onEnter)
    fan.addEventListener('pointermove', onMove)
    fan.addEventListener('pointerleave', onLeave)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      fan.removeEventListener('pointerenter', onEnter)
      fan.removeEventListener('pointermove', onMove)
      fan.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      if (restoreTimer) window.clearTimeout(restoreTimer)
    }
  }, [])
}

/**
 * Scripted chatbot demo (`[data-chat]`): a greeting on load, then quick-reply
 * chips (`.chat__chip[data-q]`) matched to canned answers for a fictional
 * plumbing business. A typing indicator delays the bot reply unless reduced.
 */
export function useChatDemo() {
  useEffect(() => {
    const chat = document.querySelector<HTMLElement>('[data-chat]')
    if (!chat) return
    const log = chat.querySelector<HTMLElement>('.chat__log')
    const quick = chat.querySelector<HTMLElement>('.chat__quick')
    if (!log) return

    // scripted answers for a fictional plumbing business
    const answers: Record<string, string> = {
      hours:
        "We're open Mon-Sat, 7am to 8pm, and we offer 24/7 emergency service for burst pipes and major leaks.",
      quote:
        'Happy to help! Most drain cleanings run $120-$180 and water-heater installs start around $950. Want me to book a free on-site estimate?',
      book: "Great - I can book you in. What day works best, and is this a repair, install, or emergency? I'll confirm by text right away.",
      area: 'We cover Austin and surrounding areas within about 25 miles, including Round Rock, Cedar Park, and Pflugerville.',
      emergency:
        "Got it - for a burst pipe, shut off your main water valve if you can. I'm dispatching an available plumber and will text you an ETA now.",
    }
    const greeting =
      'Hi! Thanks for reaching out to Rapid Plumbing Co. How can I help you today?'

    let timers: number[] = []

    const addMsg = (text: string, who: 'bot' | 'user') => {
      const m = document.createElement('div')
      m.className = 'chat__msg chat__msg--' + who
      m.textContent = text
      log.appendChild(m)
      log.scrollTop = log.scrollHeight
      return m
    }
    const typing = () => {
      const t = document.createElement('div')
      t.className = 'chat__typing'
      t.innerHTML = '<i></i><i></i><i></i>'
      log.appendChild(t)
      log.scrollTop = log.scrollHeight
      return t
    }
    const botReply = (text: string) => {
      if (reduced()) {
        addMsg(text, 'bot')
        return
      }
      const t = typing()
      timers.push(
        window.setTimeout(() => {
          t.remove()
          addMsg(text, 'bot')
        }, 900)
      )
    }

    // greeting on load
    if (reduced()) addMsg(greeting, 'bot')
    else timers.push(window.setTimeout(() => botReply(greeting), 400))

    const onQuick = (e: Event) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('.chat__chip')
      if (!chip) return
      const key = chip.getAttribute('data-q') || ''
      addMsg(chip.textContent || '', 'user')
      botReply(
        answers[key] ||
          "Good question - let me connect you with the team, or you can book a call and we'll sort it out."
      )
    }
    quick?.addEventListener('click', onQuick)

    return () => {
      quick?.removeEventListener('click', onQuick)
      timers.forEach((t) => window.clearTimeout(t))
      timers = []
      // reset the transcript so a re-run (dev double-invoke / HMR) doesn't stack greetings
      log.innerHTML = ''
    }
  }, [])
}

/** Everything a portfolio / case-study page needs. */
export function usePortfolioScripts() {
  usePnav()
  useReveal()
  useCountUp()
  usePortfolioFilters()
  usePheroParallax()
  useChatDemo()
}

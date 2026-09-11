import { useEffect, useRef } from 'react'

/**
 * Reveal a scroll container's scrollbar only while it is being scrolled.
 *
 * Returns a ref to attach to the scrollable element. On scroll it adds an
 * `is-scrolling` class and removes it again after a short idle, which the
 * `.scrollbar-overlay` CSS uses to fade the thumb in and out. The class is
 * toggled straight on the DOM node (not via React state) so scrolling never
 * triggers a re-render.
 *
 * Pair it with the `scrollbar-overlay` utility class on the same element:
 *
 * ```tsx
 * const ref = useAutoHideScrollbar<HTMLElement>()
 * <nav ref={ref} className="overflow-y-auto scrollbar-overlay">…</nav>
 * ```
 *
 * @param idleMs How long after the last scroll to hide the bar again.
 */
export function useAutoHideScrollbar<T extends HTMLElement = HTMLElement>(idleMs = 700) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let timer: number | undefined
    const onScroll = () => {
      el.classList.add('is-scrolling')
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => el.classList.remove('is-scrolling'), idleMs)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (timer) window.clearTimeout(timer)
    }
  }, [idleMs])

  return ref
}

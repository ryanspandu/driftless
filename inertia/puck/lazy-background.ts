/**
 * Client runtime for opt-in lazy background images on published pages.
 *
 * A CSS `background-image` cannot use `loading="lazy"`, so an offscreen hero
 * background is fetched immediately like any other. When an author marks a block
 * "lazy background", `Box` emits the image in a `data-bg-lazy` attribute instead
 * of the inline style; this observer swaps it into `style.backgroundImage` once
 * the element nears the viewport, then forgets it.
 *
 * Graceful and opt-in: default blocks are untouched (eager, as before), and if
 * JS or IntersectionObserver is unavailable every marked block is painted
 * immediately as a fallback, so a background is never permanently missing.
 */
export function initLazyBackgrounds(root: HTMLElement): () => void {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-bg-lazy]'))
  if (!nodes.length) return () => {}

  const paint = (el: HTMLElement) => {
    const img = el.dataset.bgLazy
    if (img) el.style.backgroundImage = img
    el.removeAttribute('data-bg-lazy')
  }

  if (!('IntersectionObserver' in window)) {
    for (const el of nodes) paint(el)
    return () => {}
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          paint(entry.target as HTMLElement)
          obs.unobserve(entry.target)
        }
      }
    },
    // Start loading a little before it scrolls into view for a seamless reveal.
    { rootMargin: '200px' }
  )
  for (const el of nodes) observer.observe(el)
  return () => observer.disconnect()
}

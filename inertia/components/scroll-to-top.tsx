import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '~/lib/utils'

/**
 * Floating "back to top" button. Hidden while the window is at the top and
 * fades in once the user scrolls past `threshold` pixels.
 */
export function ScrollToTop({ threshold = 320 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return (
    <button
      type="button"
      aria-label="Scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={cn(
        'fixed bottom-6 right-6 z-50 inline-flex size-11 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-300',
        'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      )}
    >
      <ArrowUp className="size-5" />
    </button>
  )
}
